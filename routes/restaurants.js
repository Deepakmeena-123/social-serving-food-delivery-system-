const express = require('express');
const router = express.Router();

const User = require("../models/user");
const Food = require('../models/food');
const Order = require('../models/order');
const Donation = require('../models/donation');
const PortalTime = require('../models/portal');

const multer = require('multer');
const { storage } = require('../cloudinary');
const upload = multer({ storage });

const catchAsync = require('../utils/catchAsync');


// ============================================================
// RESTAURANT ORDER TRANSITIONS
// ============================================================

const RESTAURANT_ORDER_TRANSITIONS = {
    Pending: ['Confirmed', 'Rejected'],
    Confirmed: ['Preparing'],
    Preparing: ['OutForDelivery']
};

const ACTIVE_ORDER_STATUSES = new Set([
    'Pending',
    'Confirmed',
    'Preparing',
    'OutForDelivery'
]);


// ============================================================
// CHECK RESTAURANT OWNERSHIP
// ============================================================

function restaurantOwnsEntireOrder(order, restaurantId) {

    return (
        order.order.length > 0 &&
        order.order.every((item) =>
            item.food &&
            item.food.restaurant &&
            item.food.restaurant.equals(restaurantId)
        )
    );
}


// ============================================================
// ALL RESTAURANTS
// ============================================================

router.get('/', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    const restaurants = await User.find({
        roles: 'restaurant'
    });

    res.render('restaurants/index', {
        restaurants
    });
}));


// ============================================================
// RESTAURANT MENU
// ============================================================

router.get('/:id', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    if (req.user.roles !== 'Admin') {

        const portalTime = await PortalTime.find();

        const start = portalTime?.[0]?.start ?? '00:00';
        const end = portalTime?.[0]?.end ?? '23:59';

        const today = new Date();

        const hh = String(today.getHours()).padStart(2, '0');
        const mm = String(today.getMinutes()).padStart(2, '0');

        const time = `${hh}:${mm}`;

        const userfind = await User.findById(req.user._id);

        if (userfind) {
            userfind.isOpen =
                start <= time && time <= end;

            await userfind.save();
        }
    }

    const restaurant = await User.findById(
        req.params.id
    ).populate({
        path: 'cart',
        populate: {
            path: 'food'
        }
    });

    if (!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error', 'Invalid ID');
        return res.redirect('/restaurants');
    }

    res.render('restaurants/showmenu', {
        restaurant
    });
}));


// ============================================================
// RESTAURANT DASHBOARD
// ============================================================

router.get('/:id/dashboard', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    if (!req.user._id.equals(req.params.id)) {
        req.flash('error', 'Not Authorized');
        return res.redirect('/restaurants');
    }

    const restaurant = await User.findById(
        req.params.id
    ).populate({
        path: 'cart',
        populate: {
            path: 'food'
        }
    });

    if (!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error', 'Restaurant not found');
        return res.redirect('/restaurants');
    }

    const restaurantOrders =
        await Order.find()
            .populate('user')
            .populate({
                path: 'order.food'
            });

    const filteredOrders =
        restaurantOrders.filter(order =>
            order.order.some(item =>
                item.food &&
                item.food.restaurant &&
                item.food.restaurant.equals(
                    restaurant._id
                )
            )
        );

    const recentOrders =
        filteredOrders
            .sort(
                (a, b) =>
                    b._id.getTimestamp() -
                    a._id.getTimestamp()
            )
            .slice(0, 5);

    const recentDonations =
        await Donation.find({
            donorType: 'Restaurant',
            donorId: restaurant._id
        })
        .sort({
            donationDate: -1
        })
        .limit(5);

    const totalFoodItems =
        restaurant.cart.length;

    const totalOrders =
        filteredOrders.length;

    const totalDonations =
        await Donation.countDocuments({
            donorType: 'Restaurant',
            donorId: restaurant._id
        });

    const pendingOrders =
        filteredOrders.filter(order =>
            ACTIVE_ORDER_STATUSES.has(order.status) &&
            order.paymentStatus !== 'Failed'
        ).length;

    res.render('restaurants/dashboard', {
        restaurant,
        totalFoodItems,
        totalOrders,
        totalDonations,
        pendingOrders,
        recentOrders,
        recentDonations
    });
}));


// ============================================================
// RESTAURANT ORDERS
// ============================================================

router.get('/:id/orders', catchAsync(async (req, res) => {

    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return res.redirect('/login');
    }

    if (!req.user._id.equals(req.params.id)) {
        req.flash('error', 'Not Authorized');
        return res.redirect('/restaurants');
    }

    const restaurant =
        await User.findById(req.params.id);

    if (
        !restaurant ||
        restaurant.roles !== 'restaurant'
    ) {
        req.flash('error', 'Restaurant not found');
        return res.redirect('/restaurants');
    }

    const orders =
        await Order.find()
            .populate('user')
            .populate('NGO')
            .populate({
                path: 'order.food'
            })
            .sort({
                createdAt: -1
            });

    const restaurantOrders =
        orders.filter(order =>
            order.order.some(item =>
                item.food &&
                item.food.restaurant &&
                item.food.restaurant.equals(
                    restaurant._id
                )
            )
        );

    res.render('restaurants/orders', {
        restaurant,
        orders: restaurantOrders
    });
}));


// ============================================================
// RESTAURANT ORDER STATUS UPDATE
// ============================================================

router.post(
    '/:id/orders/:orderid/status',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (
            req.user.roles !== 'restaurant' ||
            !req.user._id.equals(req.params.id)
        ) {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect('/restaurants');
        }

        const order =
            await Order.findById(
                req.params.orderid
            ).populate('order.food');

        if (!order) {
            req.flash(
                'error',
                'Order not found'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/orders`
            );
        }

        if (
            !restaurantOwnsEntireOrder(
                order,
                req.user._id
            )
        ) {
            req.flash(
                'error',
                'You can only update orders belonging to your restaurant'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/orders`
            );
        }


        // ====================================================
        // ONLINE PAYMENT CHECK
        // ====================================================

        if (
            order.modeOfPayment === 'ONLINE' &&
            order.paymentStatus !== 'Paid'
        ) {
            req.flash(
                'error',
                'Online payment has not been completed for this order'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/orders`
            );
        }


        // ====================================================
        // DONATION ORDER CHECK
        // ====================================================

        let donation = null;

        if (order.NGO) {

            donation =
                await Donation.findOne({
                    sourceOrder: order._id,
                    ngoId: order.NGO
                });

            /*
             * Restaurant cannot process a donation
             * until NGO accepts it.
             */
            if (
                order.status === 'Pending' &&
                (
                    !donation ||
                    donation.status !== 'Accepted'
                )
            ) {

                req.flash(
                    'error',
                    'Waiting for the NGO to accept this donation'
                );

                return res.redirect(
                    `/restaurants/${req.params.id}/orders`
                );
            }
        }


        // ====================================================
        // VALIDATE NEXT STATUS
        // ====================================================

        const nextStatus = req.body.status;

        if (
            !RESTAURANT_ORDER_TRANSITIONS[
                order.status
            ]?.includes(nextStatus)
        ) {

            req.flash(
                'error',
                'Invalid order status transition'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/orders`
            );
        }


        // ====================================================
        // UPDATE ORDER
        // ====================================================

        order.status = nextStatus;

        await order.save();


        // ====================================================
        // SYNCHRONIZE DONATION DELIVERY STATUS
        // ====================================================

        if (donation) {

            if (nextStatus === 'OutForDelivery') {

                donation.deliveryStatus =
                    'OutForDelivery';

                await donation.save();
            }


            if (nextStatus === 'Rejected') {

                donation.status =
                    'Rejected';

                donation.deliveryStatus =
                    'Cancelled';

                await donation.save();
            }
        }


        req.flash(
            'success',
            `Order marked as ${nextStatus}`
        );

        return res.redirect(
            `/restaurants/${req.params.id}/orders`
        );
    })
);


// ============================================================
// ADD FOOD PAGE
// ============================================================

router.get('/:id/add', (req, res) => {

    if (!req.user) {
        req.flash(
            'error',
            'User Must LOGGED IN'
        );

        return res.redirect('/login');
    }

    if (
        req.user._id.equals(
            req.params.id
        )
    ) {

        return res.render(
            'restaurants/addFood'
        );
    }

    req.flash(
        'error',
        'Not Authorized'
    );

    res.redirect('/restaurants');
});


// ============================================================
// ADD FOOD
// ============================================================

router.post(
    '/:id',
    upload.single('image'),
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const {
            name,
            count,
            price,
            description
        } = req.body;

        const food =
            new Food({
                name,
                count,
                price,
                description
            });

        if (req.file) {

            food.image = {
                url: req.file.path,
                filename: req.file.filename
            };
        }

        food.restaurant =
            req.params.id;

        const restaurant =
            await User.findById(
                req.params.id
            );

        const cart = {
            food: food._id,
            count: 0
        };

        restaurant.cart.unshift(cart);

        await restaurant.save();
        await food.save();

        res.redirect(
            `/restaurants/${restaurant._id}`
        );
    })
);


// ============================================================
// EDIT FOOD
// ============================================================

router.get(
    '/:id/:foodid/edit',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const food =
            await Food.findById(
                req.params.foodid
            ).populate('restaurant');

        res.render(
            'restaurants/editFood',
            { food }
        );
    })
);


// ============================================================
// RESTAURANT DONATION PAGE
// ============================================================

router.get(
    '/:id/donations',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (
            !req.user._id.equals(
                req.params.id
            )
        ) {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect('/restaurants');
        }

        const restaurant =
            await User.findById(
                req.params.id
            ).populate({
                path: 'cart',
                populate: {
                    path: 'food'
                }
            });

        const ngos =
            await User.find({
                roles: 'NGO'
            });

        if (!restaurant) {
            req.flash(
                'error',
                'Restaurant not found'
            );

            return res.redirect('/restaurants');
        }

        res.render(
            'restaurants/donations',
            {
                restaurant,
                ngos
            }
        );
    })
);


// ============================================================
// RESTAURANT DIRECT DONATION
// ============================================================

router.post(
    '/:id/donations',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (
            !req.user._id.equals(
                req.params.id
            )
        ) {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect('/restaurants');
        }

        const {
            selected
        } = req.body;

        if (!selected) {
            req.flash(
                'error',
                'No items selected for donation'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/donations`
            );
        }

        const selectedArr =
            Array.isArray(selected)
                ? selected
                : [selected];

        const ngoId =
            req.body.NGO;

        if (!ngoId) {
            req.flash(
                'error',
                'Please select an NGO to receive the donations'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/donations`
            );
        }

        const ngo =
            await User.findById(
                ngoId
            );

        if (!ngo || ngo.roles !== 'NGO') {
            req.flash(
                'error',
                'Selected NGO not found'
            );

            return res.redirect(
                `/restaurants/${req.params.id}/donations`
            );
        }

        const donations = [];

        for (const foodId of selectedArr) {

            const qty =
                Number.parseInt(
                    req.body[
                        `quantity_${foodId}`
                    ]
                );

            const food =
                await Food.findById(
                    foodId
                );

            if (!food) {
                req.flash(
                    'error',
                    `Food item not found: ${foodId}`
                );

                return res.redirect(
                    `/restaurants/${req.params.id}/donations`
                );
            }

            if (
                !qty ||
                qty < 1 ||
                qty > food.count
            ) {

                req.flash(
                    'error',
                    `Invalid quantity for ${food.name}`
                );

                return res.redirect(
                    `/restaurants/${req.params.id}/donations`
                );
            }

            const donation =
                new Donation({
                    donorType: 'Restaurant',
                    donorId: req.user._id,
                    donorName: req.user.username,
                    foodId: food._id,
                    foodName: food.name,
                    donatedQuantity: qty,
                    ngoId: ngo._id,
                    ngoName: ngo.username,
                    status: 'Pending',
                    deliveryStatus: 'Pending'
                });

            await donation.save();

            food.count =
                food.count - qty;

            await food.save();

            donations.push(donation);
        }

        req.flash(
            'success',
            `${donations.length} donation request(s) submitted.`
        );

        res.redirect(
            `/restaurants/${req.params.id}`
        );
    })
);


// ============================================================
// RESTAURANT DONATION HISTORY
// ============================================================

router.get(
    '/:id/donations/history',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (
            !req.user._id.equals(
                req.params.id
            )
        ) {
            req.flash(
                'error',
                'Not Authorized'
            );

            return res.redirect('/restaurants');
        }

        const donations =
            await Donation.find({
                donorType: 'Restaurant',
                donorId: req.params.id
            })
            .populate('ngoId')
            .sort({
                donationDate: -1
            });

        res.render(
            'restaurants/donationHistory',
            {
                donations
            }
        );
    })
);


// ============================================================
// UPDATE FOOD
// ============================================================

router.put(
    '/:id/:foodid',
    catchAsync(async (req, res) => {

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const {
            price,
            count,
            description
        } = req.body;

        const food =
            await Food.findById(
                req.params.foodid
            );

        food.price = price;
        food.description = description;
        food.count = count;

        await food.save();

        res.redirect(
            `/restaurants/${req.params.id}`
        );
    })
);


// ============================================================
// ADD TO CART
// ============================================================

router.post(
    '/:foodid/add',
    catchAsync(async (req, res) => {

        const food =
            await Food.findById(
                req.params.foodid
            ).populate('restaurant');

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        const user =
            await User.findById(
                req.user._id
            );

        const index =
            user.cart.findIndex(
                element =>
                    element.food.equals(
                        req.params.foodid
                    )
            );

        if (index === -1) {

            user.cart.unshift({
                food: food._id,
                count: req.body.count
            });

        } else {

            user.cart[index].count +=
                Number.parseInt(
                    req.body.count
                );
        }

        await user.save();

        food.count =
            food.count -
            req.body.count;

        await food.save();

        req.flash(
            'success',
            'Added to cart successfully. Continue shopping!'
        );

        res.redirect(
            `/restaurants/${food.restaurant._id}`
        );
    })
);


// ============================================================
// DELETE FOOD
// ============================================================

router.delete(
    '/:id/:foodid',
    catchAsync(async (req, res) => {

        const {
            id,
            foodid
        } = req.params;

        if (!req.user) {
            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }

        if (
            !req.user._id.equals(id)
        ) {
            req.flash(
                'error',
                'User is not Authorized'
            );

            return res.redirect('/login');
        }

        const restaurant =
            await User.findById(id);

        restaurant.cart =
            restaurant.cart.filter(
                c => !c.food.equals(foodid)
            );

        await restaurant.save();

        await Food.findByIdAndDelete(
            foodid
        );

        res.redirect(
            `/restaurants/${id}`
        );
    })
);


module.exports = router;