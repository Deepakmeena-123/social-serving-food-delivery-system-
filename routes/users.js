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

const isNgoUser = (user) => user && user.roles === 'NGO';
const isCustomerUser = (user) => user && user.roles === 'customer';

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

// Customer Dashboard
router.get('/customer/dashboard', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id).populate({
        path: 'order',
        populate: {
            path: 'NGO'
        }
    }).populate({
        path: 'order',
        populate: {
            path: 'order',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        }
    }).populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })

    if(!isCustomerUser(user)) {
        req.flash('error','Not Authorized')
        return res.redirect('/restaurants')
    }

    const orders = Array.isArray(user.order) ? [...user.order] : []
    const recentOrders = orders.reverse().slice(0, 5)
    const donationOrders = orders.filter((order) => order.NGO)
    const recentDonations = donationOrders.slice(0, 5)

    const totalOrders = orders.length
    const pendingOrders = orders.filter((order) => !['Success', 'Delivered', 'Cancelled', 'Failed'].includes(order.status)).length
    const totalDonations = donationOrders.length
    const cartItems = (user.cart || []).reduce((sum, item) => sum + (item.count || 0), 0)

    res.render('users/customerDashboard', {
        customer: user,
        totalOrders,
        pendingOrders,
        totalDonations,
        cartItems,
        recentOrders,
        recentDonations
    })
}))

// Customer Donation History (orders donated to NGOs)
router.get('/customer/donations/history', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id).populate({
        path: 'order',
        populate: {
            path: 'NGO'
        }
    }).populate({
        path: 'order',
        populate: {
            path: 'order',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        }
    })

    if(!isCustomerUser(user)) {
        req.flash('error','Not Authorized')
        return res.redirect('/restaurants')
    }

    const donationOrders = (user.order || []).filter((order) => order.NGO).reverse()
    res.render('users/customerDonationHistory', { donationOrders })
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

// NGO Dashboard
router.get('/ngo/dashboard', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(!isNgoUser(user)) {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donations = await Donation.find({ ngoId: user._id })
        .populate('donorId')
        .sort({ donationDate: -1 })

    const pendingDonations = donations.filter((donation) => donation.status === 'Pending').length
    const acceptedDonations = donations.filter((donation) => donation.status === 'Accepted').length
    const receivedDonations = donations.filter((donation) => ['Accepted', 'Completed', 'Received'].includes(donation.status)).length
    const totalDonations = donations.length
    const recentDonationRequests = donations.slice(0, 8)

    res.render('users/ngoDashboard', {
        ngo: user,
        pendingDonations,
        acceptedDonations,
        receivedDonations,
        totalDonations,
        recentDonationRequests
    })
}))

// Received Donations for NGO
router.get('/receiveddonations', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(!isNgoUser(user)) {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donations = await Donation.find({ ngoId: user._id, status: 'Pending' })
        .populate('donorId')
        .sort({ donationDate: -1 })

    res.render('users/receivedDonations', { donations })
}))

// Accepted/Received donations for NGO
router.get('/receiveddonations/received', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(!isNgoUser(user)) {
        req.flash('error','Not Authorized')
        return res.redirect('/')
    }

    const donations = await Donation.find({
        ngoId: user._id,
        status: { $in: ['Accepted', 'Completed', 'Received'] }
    })
        .populate('donorId')
        .sort({ donationDate: -1 })

    res.render('users/receivedDonationsList', { donations })
}))

router.post('/receiveddonations/:id/accept', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    if(!isNgoUser(user)) {
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
    if(!isNgoUser(user)) {
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
        const order = await Order.findById(req.params.orderid)
            .populate('user')
            .populate('NGO')
            .populate({
                path: 'order',
                populate: {
                    path: 'food',
                    populate: {
                        path: 'restaurant'
                    }
                }
            });

        if(!order) {
            req.flash('error', 'Order not found')
            return res.redirect('/orderhistory')
        }

        if(req.user.roles !== 'Admin' && order.user && !order.user._id.equals(req.user._id)) {
            req.flash('error', 'Not Authorized')
            return res.redirect('/orderhistory')
        }

        res.render('users/orderDetails', {order})
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