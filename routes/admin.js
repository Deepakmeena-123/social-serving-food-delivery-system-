const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Order = require('../models/order');
const PortalTime = require('../models/portal');
const Food = require('../models/food');
const Donation = require('../models/donation');
const catchAsync = require('../utils/catchAsync');
const admin = require('../controllers/admin');

router.get('/', catchAsync(admin.dashboard));
router.get('/profile', catchAsync(admin.profile));

router.get('/users', catchAsync(admin.listUsers));
router.get('/users/:id', catchAsync(admin.userDetails));
router.post('/users/:id/toggle', catchAsync(admin.toggleUser));

router.get('/restaurants', catchAsync(admin.listRestaurants));
router.get('/restaurants/:id', catchAsync(admin.restaurantDetails));
router.post('/restaurants/:id/toggle', catchAsync(admin.toggleRestaurant));

router.get('/ngos', catchAsync(admin.listNGOs));
router.get('/ngos/:id', catchAsync(admin.ngoDetails));
router.post('/ngos/:id/toggle', catchAsync(admin.toggleNgo));

router.get('/donations', catchAsync(admin.monitorDonations));
router.get('/reports', catchAsync(admin.reports));

// Legacy admin routes kept for backward compatibility.
router.get('/customer', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        const customers = await User.find({ roles: 'customer' });
        return res.render('admin/customer.ejs', { customers });
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.get('/ngo', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        const ngos = await User.find({ roles: 'NGO' });
        return res.render('admin/ngo.ejs', { ngos });
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.get('/restaurant', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        const restaurants = await User.find({ roles: 'restaurant' });
        return res.render('admin/restaurant.ejs', { restaurants });
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.get('/orders', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        const orders = await Order.find().populate({ path: 'NGO' }).populate({ path: 'user' }).populate({
            path: 'order',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        });
        return res.render('admin/orders.ejs', { orders, Food });
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.get('/windowslot', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        return res.render('admin/windowslot.ejs');
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.get('/orders/:orderid', catchAsync(async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);
    if (user.roles === 'Admin') {
        const order = await Order.findById(req.params.orderid).populate({
            path: 'order',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        });
        return res.render('admin/orderFood.ejs', { order });
    }

    req.flash('error', 'User is not Authorized');
    return res.redirect('/restaurants');
}));

router.post('/windowslot', catchAsync(async (req, res) => {
    const { start, end } = req.body;
    if (Date.parse('01 Jan 1971 ' + start + ':00 GMT') > Date.parse('01 Jan 1971 ' + end + ':00 GMT')) {
        req.flash('error', 'Inavlid time Input');
        return res.redirect('/admin/windowslot');
    }

    await PortalTime.deleteMany({});
    const portalTime = new PortalTime({ start, end });
    await portalTime.save();
    req.flash('success', 'Portal Time Saved Successfully');
    return res.redirect('/admin');
}));

module.exports = router;
