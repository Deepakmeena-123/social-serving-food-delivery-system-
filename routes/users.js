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

const ACTIVE_ORDER_STATUSES = new Set([
    'Pending',
    'Confirmed',
    'Preparing',
    'OutForDelivery'
]);


// ============================================================
// PROFILE
// ============================================================

router.get('/profile/:id', catchAsync(async (req, res) => {

    const user = await User.findById(req.params.id);

    const totalFoodDistributedDocs = await Donation.find({
        ngoId: user._id,
        status: 'Accepted'
    }).select('donatedQuantity');

    const totalFoodDistributed =
        totalFoodDistributedDocs.reduce(
            (total, donation) =>
                total + (donation.donatedQuantity || 0),
            0
        );

    res.render('users/profile', {
        user,
        totalFoodDistributed
    });
}));


// ============================================================
// UPDATE PROFILE ADDRESS
// ============================================================

router.put('/edit', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id);

    const geoData = await geocoder.forwardGeocode({
        query: req.body.location,
        limit: 1
    }).send();

    user.location = req.body.location;

    if (
        geoData.body.features &&
        geoData.body.features.length > 0
    ) {
        user.geometry = geoData.body.features[0].geometry;
    }

    await user.save();

    return res.redirect(`/profile/${req.user._id}`);
}));


// ============================================================
// ORDER HISTORY
// ============================================================

router.get('/orderhistory', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const orders = await Order.find({
        user: req.user._id
    })
        .populate('NGO')
        .populate('user')
        .populate({
            path: 'order',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        })
        .sort({
            createdAt: -1,
            _id: -1
        });

    res.render('order', {
        orders,
        str: "Orders"
    });
}));


// ============================================================
// CUSTOMER DASHBOARD
// ============================================================

router.get('/customer/dashboard', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const user = await User.findById(req.user._id)
        .populate({
            path: 'order',
            populate: {
                path: 'NGO'
            }
        })
        .populate({
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
        .populate({
            path: 'cart',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        });

    if (!isCustomerUser(user)) {
        req.flash('error', 'Not Authorized');
        return res.redirect('/restaurants');
    }

    const orders = Array.isArray(user.order)
        ? [...user.order]
        : [];

    const recentOrders = [...orders]
        .reverse()
        .slice(0, 5);

    const donationOrders = orders.filter(
        order => order.NGO
    );

    const recentDonations = donationOrders.slice(0, 5);

    const totalOrders = orders.length;

    const pendingOrders = orders.filter(order =>
        ACTIVE_ORDER_STATUSES.has(order.status) &&
        order.paymentStatus !== 'Failed'
    ).length;

    const totalDonations = donationOrders.length;

    const cartItems = (user.cart || []).reduce(
        (sum, item) => sum + (item.count || 0),
        0
    );

    res.render('users/customerDashboard', {
        customer: user,
        totalOrders,
        pendingOrders,
        totalDonations,
        cartItems,
        recentOrders,
        recentDonations
    });
}));


// ============================================================
// CUSTOMER DONATION HISTORY
// ============================================================

router.get(
    '/customer/donations/history',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash('error', 'User Must LOGGED IN');
            return res.redirect('/login');
        }

        const user = await User.findById(req.user._id)
            .populate({
                path: 'order',
                populate: {
                    path: 'NGO'
                }
            })
            .populate({
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
            });

        if (!isCustomerUser(user)) {
            req.flash('error', 'Not Authorized');
            return res.redirect('/restaurants');
        }

        const donationOrders = (user.order || [])
            .filter(order => order.NGO)
            .reverse();

        const donationRecords = await Donation.find({
            donorId: user._id,
            sourceOrder: {
                $in: donationOrders.map(order => order._id)
            }
        }).select(
            'sourceOrder status deliveryStatus'
        );

        const donationStatusByOrder = new Map(
            donationRecords.map(donation => [
                donation.sourceOrder.toString(),
                {
                    status: donation.status,
                    deliveryStatus: donation.deliveryStatus
                }
            ])
        );

        donationOrders.forEach(order => {

            const donationInfo =
                donationStatusByOrder.get(
                    order._id.toString()
                );

            order.donationStatus =
                donationInfo?.status;

            order.donationDeliveryStatus =
                donationInfo?.deliveryStatus;
        });

        res.render(
            'users/customerDonationHistory',
            {
                donationOrders
            }
        );
    })
);


// ============================================================
// NGO DONATION HISTORY
// ============================================================

router.get(
    '/donationhistory',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash('error', 'User Must LOGGED IN');
            return res.redirect('/login');
        }

        const user = await User.findById(req.user._id);

        if (!isNgoUser(user)) {
            req.flash('error', 'Not Authorized');
            return res.redirect('/');
        }

        const donations = await Donation.find({
            ngoId: user._id
        })
            .populate('donorId')
            .sort({
                donationDate: -1
            });

        res.render(
            'users/donationHistory',
            {
                donations
            }
        );
    })
);


// ============================================================
// NGO DASHBOARD
// ============================================================

router.get(
    '/ngo/dashboard',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash('error', 'User Must LOGGED IN');
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash('error', 'Not Authorized');
            return res.redirect('/');
        }

        const donations = await Donation.find({
            ngoId: user._id
        })
            .populate('donorId')
            .sort({
                donationDate: -1
            });

        const pendingDonations =
            donations.filter(
                donation =>
                    donation.status === 'Pending'
            ).length;

        const acceptedDonations =
            donations.filter(
                donation =>
                    donation.status === 'Accepted'
            ).length;

        const receivedDonations =
            donations.filter(
                donation =>
                    [
                        'Accepted',
                        'Received',
                        'Completed'
                    ].includes(donation.status)
            ).length;

        const totalDonations =
            donations.length;

        const recentDonationRequests =
            donations.slice(0, 8);

        res.render(
            'users/ngoDashboard',
            {
                ngo: user,
                pendingDonations,
                acceptedDonations,
                receivedDonations,
                totalDonations,
                recentDonationRequests
            }
        );
    })
);


// ============================================================
// NGO - PENDING DONATION REQUESTS
// ============================================================

router.get(
    '/receiveddonations',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash('error', 'User Must LOGGED IN');
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash('error', 'Not Authorized');
            return res.redirect('/');
        }

        /*
         * IMPORTANT:
         *
         * This page only shows NEW/PENDING requests.
         *
         * Once NGO accepts a donation,
         * status becomes "Accepted".
         *
         * Therefore it automatically disappears
         * from this page.
         */

        const donations = await Donation.find({
            ngoId: user._id,
            status: 'Pending'
        })
            .populate('donorId')
            .sort({
                donationDate: -1
            });

        res.render(
            'users/receivedDonations',
            {
                donations
            }
        );
    })
);


// ============================================================
// NGO - RECEIVED / ACCEPTED DONATIONS
// ============================================================

router.get(
    '/receiveddonations/received',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash('error', 'User Must LOGGED IN');
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash('error', 'Not Authorized');
            return res.redirect('/');
        }

        /*
         * This page keeps showing the donation after
         * NGO accepts it.
         *
         * Accepted
         * Received
         * Completed
         */

        const donations = await Donation.find({
            ngoId: user._id,
            status: {
                $in: [
                    'Accepted',
                    'Received',
                    'Completed'
                ]
            }
        })
            .populate('donorId')
            .sort({
                donationDate: -1
            });

        res.render(
            'users/receivedDonationsList',
            {
                donations
            }
        );
    })
);


// ============================================================
// NGO ACCEPT DONATION
// ============================================================

router.post(
    '/receiveddonations/:id/accept',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash(
                'error',
                'Not Authorized'
            );
            return res.redirect('/');
        }

        const donation =
            await Donation.findById(
                req.params.id
            );

        if (!donation) {
            req.flash(
                'error',
                'Donation not found'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        if (
            !donation.ngoId ||
            !donation.ngoId.equals(user._id)
        ) {
            req.flash(
                'error',
                'Donation not found'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        if (
            donation.status !== 'Pending'
        ) {
            req.flash(
                'error',
                'Only pending donations can be accepted'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        donation.status = 'Accepted';

        /*
         * Keep existing delivery status if restaurant
         * has already set one.
         */
        donation.deliveryStatus =
            donation.deliveryStatus || 'Pending';

        await donation.save();

        req.flash(
            'success',
            'Donation accepted successfully'
        );

        /*
         * IMPORTANT:
         *
         * Go to Received Donations page.
         * The donation will now appear there.
         */
        return res.redirect(
            '/receiveddonations/received'
        );
    })
);


// ============================================================
// NGO REJECT DONATION
// ============================================================

router.post(
    '/receiveddonations/:id/reject',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash(
                'error',
                'Not Authorized'
            );
            return res.redirect('/');
        }

        const donation =
            await Donation.findById(
                req.params.id
            );

        if (!donation) {
            req.flash(
                'error',
                'Donation not found'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        if (
            !donation.ngoId ||
            !donation.ngoId.equals(user._id)
        ) {
            req.flash(
                'error',
                'Donation not found'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        if (
            donation.status !== 'Pending'
        ) {
            req.flash(
                'error',
                'Only pending donations can be rejected'
            );
            return res.redirect(
                '/receiveddonations'
            );
        }

        donation.status = 'Rejected';
        donation.deliveryStatus = 'Cancelled';

        await donation.save();

        req.flash(
            'success',
            'Donation rejected'
        );

        return res.redirect(
            '/receiveddonations'
        );
    })
);


// ============================================================
// NGO CONFIRMS FOOD RECEIVED
// ============================================================

router.post(
    '/receiveddonations/:id/received',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );
            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash(
                'error',
                'Not Authorized'
            );
            return res.redirect('/');
        }

        const donation =
            await Donation.findOne({
                _id: req.params.id,
                ngoId: user._id
            });

        if (!donation) {
            req.flash(
                'error',
                'Donation not found'
            );

            return res.redirect(
                '/receiveddonations/received'
            );
        }

        /*
         * NGO can click "I Received Donation"
         * only after restaurant sends it.
         */

        if (
            donation.status !== 'Accepted' ||
            donation.deliveryStatus !== 'OutForDelivery'
        ) {

            req.flash(
                'error',
                'The restaurant must mark the donation as Out For Delivery first'
            );

            return res.redirect(
                '/receiveddonations/received'
            );
        }

        /*
         * FINAL RECEIVED STATE
         */

        donation.status = 'Received';
        donation.deliveryStatus = 'Delivered';
        donation.receivedAt = new Date();

        await donation.save();

        /*
         * IMPORTANT:
         *
         * The NGO is the final receiver of a donation.
         * The customer should NOT confirm delivery.
         *
         * The Donation contains sourceOrder, which points to
         * the original customer Order. When the NGO confirms
         * receipt, update that original Order to Delivered too.
         *
         * This makes the final delivery state visible on:
         * - Restaurant Orders
         * - Customer Order History
         * - Customer Order Details
         */
        if (donation.sourceOrder) {

            const sourceOrder =
                await Order.findById(
                    donation.sourceOrder
                );

            if (sourceOrder) {
                sourceOrder.status = 'Delivered';

                await sourceOrder.save();
            }
        }

        req.flash(
            'success',
            'Donation received successfully'
        );

        /*
         * Stay on Received Donations page.
         *
         * The donation remains visible here.
         */

        return res.redirect(
            '/receiveddonations/received'
        );
    })
);


// ============================================================
// BACKWARD COMPATIBILITY
// ============================================================
//
// Some older EJS pages use:
//
// /receiveddonations/:id/complete
//
// Instead of:
//
// /receiveddonations/:id/received
//
// So we support BOTH.
//

router.post(
    '/receiveddonations/:id/complete',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const user = await User.findById(
            req.user._id
        );

        if (!isNgoUser(user)) {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect('/');
        }

        const donation =
            await Donation.findOne({
                _id: req.params.id,
                ngoId: user._id
            });

        if (!donation) {

            req.flash(
                'error',
                'Donation not found'
            );

            return res.redirect(
                '/receiveddonations/received'
            );
        }

        /*
         * The donation must be:
         *
         * Accepted
         * AND
         * OutForDelivery
         */

        if (
            donation.status !== 'Accepted' ||
            donation.deliveryStatus !== 'OutForDelivery'
        ) {

            req.flash(
                'error',
                'The restaurant must mark the donation as Out For Delivery first'
            );

            return res.redirect(
                '/receiveddonations/received'
            );
        }

        /*
         * Mark donation as received.
         */

        donation.status = 'Received';
        donation.deliveryStatus = 'Delivered';
        donation.receivedAt = new Date();

        await donation.save();

        /*
         * IMPORTANT:
         *
         * For donation orders, the NGO is the final receiver.
         * Therefore, when the NGO confirms receipt, update the
         * original customer Order to Delivered as well.
         */
        if (donation.sourceOrder) {

            const sourceOrder =
                await Order.findById(
                    donation.sourceOrder
                );

            if (sourceOrder) {
                sourceOrder.status = 'Delivered';

                await sourceOrder.save();
            }
        }

        req.flash(
            'success',
            'Donation received successfully'
        );

        return res.redirect(
            '/receiveddonations/received'
        );
    })
);


// ============================================================
// ORDER DETAILS
// ============================================================

router.get(
    '/orderhistory/:orderid',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const order =
            await Order.findById(
                req.params.orderid
            )
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

        if (!order) {
            req.flash(
                'error',
                'Order not found'
            );

            return res.redirect(
                '/orderhistory'
            );
        }

        if (
            req.user.roles !== 'Admin' &&
            order.user &&
            !order.user._id.equals(
                req.user._id
            )
        ) {

            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect(
                '/orderhistory'
            );
        }

        res.render(
            'users/orderDetails',
            {
                order
            }
        );
    })
);


// ============================================================
// CUSTOMER MARKS ORDER RECEIVED
// ============================================================

router.post(
    '/orderhistory/:orderid/received',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (req.user.roles !== 'customer') {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect(
                '/orderhistory'
            );
        }

        const order =
            await Order.findOne({
                _id: req.params.orderid,
                user: req.user._id
            });

        if (!order) {
            req.flash(
                'error',
                'Order not found'
            );

            return res.redirect(
                '/orderhistory'
            );
        }

        if (
            order.status !== 'OutForDelivery'
        ) {

            req.flash(
                'error',
                'This order is not ready for delivery confirmation'
            );

            return res.redirect(
                `/orderhistory/${order._id}`
            );
        }

        order.status = 'Delivered';

        await order.save();

        req.flash(
            'success',
            'Order marked as delivered'
        );

        return res.redirect(
            `/orderhistory/${order._id}`
        );
    })
);


// ============================================================
// REGISTER
// ============================================================

router.route('/register')
    .get(users.renderRegister)
    .post(
        upload.single('image'),
        catchAsync(users.register)
    );


// ============================================================
// LOGIN
// ============================================================

router.route('/login')
    .get(users.renderLogin)
    .post(
        passport.authenticate(
            'local',
            {
                failureFlash: true,
                failureRedirect: '/login'
            }
        ),
        users.login
    );


// ============================================================
// LOGOUT
// ============================================================

router.get(
    '/logout',
    users.logout
);


module.exports = router;