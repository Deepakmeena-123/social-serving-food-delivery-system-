const express = require('express');
const router = express.Router();
const passport = require('passport');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/user');
const Order = require('../models/order');
const Donation = require('../models/donation');
const Food = require('../models/food');
const users = require('../controllers/users');
const multer = require('multer');
const { storage } = require('../cloudinary');
const upload = multer({ storage });
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapBoxToken = process.env.MAPBOX_TOKEN;
const geocoder = mbxGeocoding({ accessToken: mapBoxToken });

//Getting Profile
router.get('/profile/:id',catchAsync(async (req,res) => {
    const user = await User.findById(req.params.id)
    const totalFoodDistributedDocs = await Donation.find({ ngoId: user._id, status: 'Accepted' })
        .select('donatedQuantity');
    const totalFoodDistributed = totalFoodDistributedDocs.reduce((total, donation) => total + (donation.donatedQuantity || 0), 0);

    res.render('users/profile', { user, totalFoodDistributed });
}))

//Updating Address in the Profile
router.put('/edit', catchAsync( async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const user = await User.findById(req.user)
    const geoData = await geocoder.forwardGeocode({
        query: req.body.location,
        limit: 1
    }).send()
    user.location = req.body.location
    user.geometry = geoData.body.features[0].geometry;
    await user.save();
    res.redirect(`/profile/${req.user._id}`)
}
}))

//Order History of User
router.get('/orderhistory',catchAsync( async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const user = await User.findById(req.user._id).populate({
            path: 'order',
            populate: {
                path: 'NGO'
            }
        }).populate({
            path:'order',
            populate: {
                path: 'user'
            }
        }).populate({
            path: 'order',
            populate: {
                path: 'order',
                populate: {
                    path: 'food',
                    populate:{
                        path: 'restaurant'
                    }
                }
            }
        })
        const orders = user.order
        console.log(orders)
        res.render('order',{ orders, str: "Orders" })
    }
}))

//Donation History of the NGOs
router.get('/donationhistory',catchAsync( async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const user = await User.findById(req.user._id)
        if(user.roles !== 'NGO') {
            req.flash('error','Not Authorized')
            return res.redirect('/')
        }

        const donations = await Donation.find({ ngoId: user._id })
            .populate('donorId')
            .sort({ donationDate: -1 })

        res.render('users/donationHistory', { donations })
    }
}))

// Received Donations for NGO
router.get('/receiveddonations', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(user.roles !== 'NGO') {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donations = await Donation.find({ ngoId: user._id, status: 'Pending' })
        .populate('donorId')
        .sort({ donationDate: -1 })

    res.render('users/receivedDonations', { donations })
}))

router.post('/receiveddonations/:id/accept', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(user.roles !== 'NGO') {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donation = await Donation.findById(req.params.id)
    if(!donation) {
        req.flash('error','Donation not found')
        return res.redirect('/receiveddonations')
    }
    if(!donation.ngoId?.equals(user._id)) {
        req.flash('error','Donation not found')
        return res.redirect('/receiveddonations')
    }

    donation.status = 'Accepted'
    await donation.save()
    req.flash('success', 'Donation accepted successfully')
    res.redirect('/receiveddonations')
}))

router.post('/receiveddonations/:id/reject', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(user.roles !== 'NGO') {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donation = await Donation.findById(req.params.id)
    if(!donation) {
        req.flash('error','Donation not found')
        return res.redirect('/receiveddonations')
    }
    if(!donation.ngoId?.equals(user._id)) {
        req.flash('error','Donation not found')
        return res.redirect('/receiveddonations')
    }

    donation.status = 'Rejected'
    await donation.save()
    req.flash('success', 'Donation rejected')
    res.redirect('/receiveddonations')
}))

//Order Details
router.get('/orderhistory/:orderid', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const order = await Order.findById(req.params.orderid).populate({path: 'order',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }} );
        res.render('admin/orderFood.ejs', {order})
    }
}))

//Register
router.route('/register')
    .get(users.renderRegister)
    .post(upload.single('image'),catchAsync(users.register));

//Login
router.route('/login')
    .get(users.renderLogin)
    .post(passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), users.login)

//Logout
router.get('/logout', users.logout)

module.exports = router;