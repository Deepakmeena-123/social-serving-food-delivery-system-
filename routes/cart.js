const express = require('express');
const router = express.Router();

const User = require("../models/user");
const Food = require('../models/food');
const Order = require('../models/order');
const Donation = require('../models/donation');

const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_SECRET
});

const catchAsync = require('../utils/catchAsync');


// ============================================================
// DELIVERY CALCULATION
// ============================================================

function calculateDelivery(user, restaurant) {

    if (
        !user?.geometry?.coordinates ||
        !restaurant?.geometry?.coordinates
    ) {
        return 0;
    }

    const latDiff =
        user.geometry.coordinates[1] * Math.PI / 180 -
        restaurant.geometry.coordinates[1] * Math.PI / 180;

    const longDiff =
        user.geometry.coordinates[0] * Math.PI / 180 -
        restaurant.geometry.coordinates[0] * Math.PI / 180;

    const a =
        Math.sin(latDiff / 2) ** 2 +
        Math.cos(
            user.geometry.coordinates[1] * Math.PI / 180
        ) *
        Math.cos(
            restaurant.geometry.coordinates[1] * Math.PI / 180
        ) *
        Math.sin(longDiff / 2) ** 2;

    const c =
        2 * Math.atan2(
            a ** 0.5,
            (1 - a) ** 0.5
        );

    const distance = c * 6371;

    if (distance < 2) {
        return 0;
    }

    return Number.parseInt(5 * 100 * distance) / 100;
}


// ============================================================
// DIRECT ORDER TOTALS
// ============================================================

function calculateDirectOrderTotals(
    user,
    food,
    count
) {

    const quantity = Number.parseInt(count);

    const baseAmount =
        food.price * quantity;

    const discountedAmount =
        user.roles === 'customer'
            ? baseAmount * 0.8
            : baseAmount * 0.6;

    const delivery =
        calculateDelivery(
            user,
            food.restaurant
        );

    const total =
        Number.parseInt(
            100 * (discountedAmount + delivery)
        ) / 100;

    return {
        quantity,
        delivery,
        total,
        discountedAmount
    };
}


// ============================================================
// DIRECT ORDER ITEMS
// ============================================================

function buildDirectOrderItems(
    user,
    food,
    quantity
) {

    const money =
        user.roles === 'customer'
            ? food.price * quantity * 0.8
            : food.price * quantity * 0.6;

    return [
        {
            food: food._id,
            count: quantity,
            money
        }
    ];
}


// ============================================================
// SELECTED FOOD IDS
// ============================================================

function normalizeSelectedFoodIds(
    selectedFoodIds
) {

    if (!selectedFoodIds) {
        return [];
    }

    if (Array.isArray(selectedFoodIds)) {
        return selectedFoodIds.map(
            id => id.toString()
        );
    }

    return [
        selectedFoodIds.toString()
    ];
}


// ============================================================
// GET SELECTED CART ITEMS
// ============================================================

function getSelectedCartItems(
    cart,
    selectedFoodIds
) {

    const selectedSet =
        new Set(selectedFoodIds);

    return cart.filter(
        item =>
            item.food &&
            selectedSet.has(
                item.food._id.toString()
            )
    );
}


// ============================================================
// BUILD ORDER ITEMS
// ============================================================

function buildOrderItemsFromCart(
    user,
    selectedCart
) {

    return selectedCart.map(
        item => ({
            food: item.food._id,

            count: item.count,

            money:
                user.roles === 'customer'
                    ? item.food.price *
                      item.count *
                      0.8
                    : item.food.price *
                      item.count *
                      0.6
        })
    );
}


// ============================================================
// CALCULATE SELECTED CART TOTAL
// ============================================================

function calculateSelectedCartTotal(
    user,
    selectedCart
) {

    let subtotal = 0;

    selectedCart.forEach(item => {

        subtotal +=
            user.roles === 'customer'
                ? item.food.price *
                  item.count *
                  0.8
                : item.food.price *
                  item.count *
                  0.6;
    });

    const delivery =
        selectedCart[0]
            ? calculateDelivery(
                user,
                selectedCart[0].food.restaurant
            )
            : 0;

    const total =
        Number.parseInt(
            100 * (subtotal + delivery)
        ) / 100;

    return {
        subtotal,
        delivery,
        total
    };
}


// ============================================================
// REMOVE SELECTED ITEMS FROM CART
// ============================================================

function removeSelectedItemsFromCart(
    user,
    selectedFoodIds
) {

    const selectedSet =
        new Set(selectedFoodIds);

    user.cart =
        user.cart.filter(
            item =>
                !selectedSet.has(
                    item.food.toString()
                )
        );
}


// ============================================================
// GET SINGLE RESTAURANT
// ============================================================

function getSingleRestaurantId(items) {

    const restaurantIds =
        new Set(
            items
                .map(
                    item =>
                        item.food &&
                        item.food.restaurant &&
                        item.food.restaurant._id
                            ? item.food.restaurant._id.toString()
                            : item.food &&
                              item.food.restaurant
                                ? item.food.restaurant.toString()
                                : null
                )
                .filter(Boolean)
        );

    return restaurantIds.size === 1
        ? [...restaurantIds][0]
        : null;
}


// ============================================================
// RAZORPAY SIGNATURE VERIFICATION
// ============================================================

function hasValidRazorpaySignature(
    orderId,
    paymentId,
    signature
) {

    if (
        !process.env.RAZORPAY_SECRET ||
        !orderId ||
        !paymentId ||
        !signature
    ) {
        return false;
    }

    const expectedSignature =
        crypto
            .createHmac(
                'sha256',
                process.env.RAZORPAY_SECRET
            )
            .update(
                `${orderId}|${paymentId}`
            )
            .digest('hex');

    const expected =
        Buffer.from(
            expectedSignature,
            'utf8'
        );

    const received =
        Buffer.from(
            signature,
            'utf8'
        );

    return (
        expected.length === received.length &&
        crypto.timingSafeEqual(
            expected,
            received
        )
    );
}


// ============================================================
// CREATE RAZORPAY ORDER
// ============================================================

async function createRazorpayOrder(
    order,
    amount,
    req
) {

    try {

        const razorpayOrder =
            await razorpay.orders.create({

                amount:
                    Math.round(
                        Number(amount) * 100
                    ),

                currency: 'INR'
            });

        order.transaction = {
            order_id:
                razorpayOrder.id
        };

        await order.save();

        req.session.pendingOnlineOrderId =
            order._id.toString();

        return razorpayOrder;

    } catch (err) {

        /*
         * Razorpay order creation failed.
         *
         * The customer must NOT have an active
         * restaurant order.
         */
        order.paymentStatus = 'Failed';
        order.status = 'Cancelled';

        await order.save();

        throw err;
    }
}


// ============================================================
// CREATE DONATION RECORDS
// ============================================================

async function createDonationRecordsForPaidOrder(
    order,
    user
) {

    if (
        !order.NGO ||
        await Donation.exists({
            sourceOrder: order._id
        })
    ) {
        return;
    }

    const ngo =
        await User.findOne({
            _id: order.NGO,
            roles: 'NGO'
        });

    if (!ngo) {
        return;
    }

    const foodIds =
        order.order.map(
            item => item.food
        );

    const foods =
        await Food.find({
            _id: {
                $in: foodIds
            }
        });

    const foodById =
        new Map(
            foods.map(
                food => [
                    food._id.toString(),
                    food
                ]
            )
        );

    const donations =
        order.order
            .map(
                item => ({
                    item,
                    food:
                        foodById.get(
                            item.food.toString()
                        )
                })
            )
            .filter(
                ({ food }) => food
            )
            .map(
                ({ item, food }) => ({

                    donorType: 'Customer',

                    donorId: user._id,

                    donorName:
                        user.username,

                    foodId: food._id,

                    foodName:
                        food.name,

                    donatedQuantity:
                        item.count,

                    ngoId:
                        ngo._id,

                    ngoName:
                        ngo.username,

                    sourceOrder:
                        order._id,

                    status: 'Pending'
                })
            );

    if (donations.length > 0) {
        await Donation.insertMany(
            donations
        );
    }
}


// ============================================================
// VERIFY PENDING ONLINE PAYMENT
// ============================================================

async function verifyPendingOnlinePayment(
    req,
    user
) {

    const pendingOrderId =
        req.session.pendingOnlineOrderId;

    if (!pendingOrderId) {
        return null;
    }

    const order =
        await Order.findOne({
            _id: pendingOrderId,
            user: user._id
        });

    if (
        !order ||
        order.modeOfPayment !== 'ONLINE' ||
        order.paymentStatus !== 'Pending'
    ) {
        return null;
    }

    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
    } = req.body;

    /*
     * Verify that the payment belongs to
     * the Razorpay order created for this
     * FoodBridge order.
     */
    if (
        order.transaction?.order_id !==
            razorpay_order_id ||

        !hasValidRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        )
    ) {

        order.paymentStatus = 'Failed';

        /*
         * Failed online payment must not
         * remain as an active restaurant order.
         */
        order.status = 'Cancelled';

        await order.save();

        return false;
    }


    /*
     * PAYMENT SUCCESS
     *
     * IMPORTANT:
     *
     * Payment becomes Paid.
     *
     * Order remains Pending.
     *
     * Restaurant still needs to confirm
     * the order.
     */
    order.paymentStatus = 'Paid';

    order.transaction = {

        payment_id:
            razorpay_payment_id,

        order_id:
            razorpay_order_id,

        signature:
            razorpay_signature
    };

    await order.save();


    /*
     * Donation records are created only
     * after successful payment.
     */
    await createDonationRecordsForPaidOrder(
        order,
        user
    );


    req.session.pendingOnlineOrderId =
        null;

    return order;
}


// ============================================================
// CART PAGE
// ============================================================

router.get(
    '/',
    catchAsync(async (req, res) => {

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
            ).populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const cart =
            user.cart || [];


        /*
         * IMPORTANT:
         *
         * cart/index.ejs uses "money".
         * Keep sending it to the view.
         */
        let money = 0;

        for (let i in cart) {

            if (
                cart[i].food
            ) {

                money +=
                    cart[i].count *
                    cart[i].food.price;
            }
        }


        res.render(
            'cart/index',
            {
                cart,
                money
            }
        );
    })
);


// ============================================================
// STORE SELECTED CART ITEMS
// ============================================================

router.post(
    '/selection',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }


        const selectedFoodIds =
            normalizeSelectedFoodIds(
                req.body.selectedFoodIds
            );


        if (
            selectedFoodIds.length === 0
        ) {

            req.flash(
                'error',
                'Please select at least one food item'
            );

            return res.redirect('/cart');
        }


        req.session.selectedCartFoodIds =
            selectedFoodIds;


        res.redirect(
            '/cart/checkout/confirm'
        );
    })
);


// ============================================================
// STORE SELECTED ITEMS FOR DONATION
// ============================================================

router.post(
    '/selection/donation',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }


        const selectedFoodIds =
            normalizeSelectedFoodIds(
                req.body.selectedFoodIds
            );


        if (
            selectedFoodIds.length === 0
        ) {

            req.flash(
                'error',
                'Please select at least one food item'
            );

            return res.redirect('/cart');
        }


        req.session.selectedCartFoodIds =
            selectedFoodIds;


        res.redirect(
            '/cart/donation'
        );
    })
);


// ============================================================
// SELECTED CHECKOUT CONFIRMATION
// ============================================================

router.get(
    '/checkout/confirm',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect('/login');
        }


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        if (
            selectedFoodIds.length === 0
        ) {

            req.flash(
                'error',
                'Please select items from cart first'
            );

            return res.redirect('/cart');
        }


        const user =
            await User.findById(
                req.user._id
            ).populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const selectedCart =
            getSelectedCartItems(
                user.cart,
                selectedFoodIds
            );


        if (
            selectedCart.length === 0
        ) {

            req.flash(
                'error',
                'No selected items found in cart'
            );

            return res.redirect('/cart');
        }


        if (
            !getSingleRestaurantId(
                selectedCart
            )
        ) {

            req.flash(
                'error',
                'Please checkout items from one restaurant at a time'
            );

            return res.redirect('/cart');
        }


        const totals =
            calculateSelectedCartTotal(
                user,
                selectedCart
            );


        res.render(
            'cart/confirmOrder',
            {

                selectedCart,

                subtotal:
                    totals.subtotal,

                delivery:
                    totals.delivery,

                total:
                    totals.total
            }
        );
    })
);


// ============================================================
// DIRECT ORDER CONFIRMATION PAGE
// ============================================================

router.post(
    '/place-order/:foodid',
    catchAsync(async (req, res) => {

        if (req.user) {

            const food =
                await Food.findById(
                    req.params.foodid
                ).populate(
                    'restaurant'
                );


            if (!food) {

                req.flash(
                    'error',
                    'Food item not found'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            const quantity =
                Number.parseInt(
                    req.body.count
                );


            if (
                !quantity ||
                quantity < 1 ||
                quantity > food.count
            ) {

                req.flash(
                    'error',
                    'Please select a valid quantity'
                );

                return res.redirect(
                    `/restaurants/${food.restaurant._id}`
                );
            }


            const user =
                await User.findById(
                    req.user._id
                );


            const totals =
                calculateDirectOrderTotals(
                    user,
                    food,
                    quantity
                );


            req.session.directOrder = {

                foodId:
                    food._id.toString(),

                restaurantId:
                    food.restaurant._id.toString(),

                quantity,

                total:
                    totals.total
            };


            res.render(
                'cart/placeOrder',
                {

                    food,

                    quantity,

                    delivery:
                        totals.delivery,

                    total:
                        totals.total,

                    discountedAmount:
                        Number.parseInt(
                            100 *
                            totals.discountedAmount
                        ) / 100
                }
            );

        } else {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }
    })
);


// ============================================================
// UPDATE CART ITEM
// ============================================================

router.put(
    '/:foodid',
    catchAsync(async (req, res) => {

        const { count } =
            req.body;


        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const food =
            await Food.findById(
                req.params.foodid
            );

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

            req.flash(
                'error',
                'Something Went Wrong'
            );

        } else {

            const diff =
                req.body.count -
                user.cart[index].count;


            user.cart[index].count +=
                parseInt(diff);


            food.count =
                food.count - diff;


            await food.save();

            await user.save();
        }


        res.redirect('/cart');
    })
);


// ============================================================
// DELETE CART ITEM
// ============================================================

router.delete(
    '/:foodid',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const food =
            await Food.findById(
                req.params.foodid
            );

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

            req.flash(
                'error',
                'Something Went Wrong'
            );

        } else {

            food.count =
                food.count +
                user.cart[index].count;


            const cart =
                user.cart.filter(
                    c => {

                        if (
                            !c.food.equals(
                                req.params.foodid
                            )
                        ) {
                            return c;
                        }
                    }
                );


            user.cart = cart;


            await food.save();

            await user.save();
        }


        res.redirect('/cart');
    })
);


// ============================================================
// ONLINE PAYMENT - COMPLETE CART
// ============================================================

router.post(
    '/pay/online',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const user =
            await req.user.populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const cart =
            user.cart;


        const restaurantId =
            getSingleRestaurantId(
                cart
            );


        if (!restaurantId) {

            return res.status(400).json({
                error:
                    'Please checkout items from one restaurant at a time'
            });
        }


        const restaurant =
            await User.findById(
                restaurantId
            );


        const newCart = [];


        cart.forEach(item => {

            let newItem = {};


            if (
                req.user.roles ===
                'customer'
            ) {

                newItem = {

                    food:
                        item.food._id,

                    count:
                        item.count,

                    money:
                        item.food.price *
                        item.count *
                        0.8
                };

            } else {

                newItem = {

                    food:
                        item.food._id,

                    count:
                        item.count,

                    money:
                        item.food.price *
                        item.count *
                        0.6
                };
            }


            newCart.push(
                newItem
            );
        });


        const newOrder =
            new Order({

                user:
                    user._id,

                order:
                    newCart,

                money:
                    req.body.amount,

                modeOfPayment:
                    'ONLINE',

                /*
                 * Payment has not yet been
                 * verified.
                 */
                paymentStatus:
                    'Pending',

                /*
                 * Restaurant still needs
                 * to confirm the order.
                 */
                status:
                    'Pending',

                selfpickup:
                    req.body.selfpickup
            });


        /*
         * Add order to restaurant.
         */
        restaurant.order.unshift(
            newOrder._id
        );


        /*
         * Add order to customer.
         */
        user.order.unshift(
            newOrder._id
        );


        await user.save();

        await newOrder.save();

        await restaurant.save();


        const razorpayOrder =
            await createRazorpayOrder(
                newOrder,
                req.body.amount,
                req
            );


        res.json(
            razorpayOrder
        );
    })
);


// ============================================================
// ONLINE PAYMENT - SELECTED CART
// ============================================================

router.post(
    '/checkout/pay/online',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        if (
            selectedFoodIds.length === 0
        ) {

            req.flash(
                'error',
                'Please select items from cart first'
            );

            return res.redirect(
                '/cart'
            );
        }


        const user =
            await User.findById(
                req.user._id
            ).populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const selectedCart =
            getSelectedCartItems(
                user.cart,
                selectedFoodIds
            );


        if (
            selectedCart.length === 0
        ) {

            req.flash(
                'error',
                'No selected items found in cart'
            );

            return res.redirect(
                '/cart'
            );
        }


        const restaurantId =
            getSingleRestaurantId(
                selectedCart
            );


        if (!restaurantId) {

            req.flash(
                'error',
                'Please checkout items from one restaurant at a time'
            );

            return res.redirect(
                '/cart'
            );
        }


        const totals =
            calculateSelectedCartTotal(
                user,
                selectedCart
            );


        const restaurant =
            await User.findById(
                restaurantId
            );


        const newOrder =
            new Order({

                user:
                    user._id,

                order:
                    buildOrderItemsFromCart(
                        user,
                        selectedCart
                    ),

                money:
                    totals.total,

                modeOfPayment:
                    'ONLINE',

                paymentStatus:
                    'Pending',

                status:
                    'Pending',

                selfpickup:
                    false
            });


        restaurant.order.unshift(
            newOrder._id
        );


        user.order.unshift(
            newOrder._id
        );


        await user.save();

        await newOrder.save();

        await restaurant.save();


        const razorpayOrder =
            await createRazorpayOrder(
                newOrder,
                totals.total,
                req
            );


        res.json(
            razorpayOrder
        );
    })
);


// ============================================================
// COD - SELECTED CART
// ============================================================

router.post(
    '/checkout/pay/cod',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        if (
            selectedFoodIds.length === 0
        ) {

            req.flash(
                'error',
                'Please select items from cart first'
            );

            return res.redirect(
                '/cart'
            );
        }


        const user =
            await User.findById(
                req.user._id
            ).populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const selectedCart =
            getSelectedCartItems(
                user.cart,
                selectedFoodIds
            );


        if (
            selectedCart.length === 0
        ) {

            req.flash(
                'error',
                'No selected items found in cart'
            );

            return res.redirect(
                '/cart'
            );
        }


        const restaurantId =
            getSingleRestaurantId(
                selectedCart
            );


        if (!restaurantId) {

            req.flash(
                'error',
                'Please checkout items from one restaurant at a time'
            );

            return res.redirect(
                '/cart'
            );
        }


        const totals =
            calculateSelectedCartTotal(
                user,
                selectedCart
            );


        const restaurant =
            await User.findById(
                restaurantId
            );


        /*
         * COD ORDER
         *
         * Order status:
         * Pending
         *
         * Payment status:
         * COD
         */
        const newOrder =
            new Order({

                user:
                    user._id,

                order:
                    buildOrderItemsFromCart(
                        user,
                        selectedCart
                    ),

                money:
                    totals.total,

                modeOfPayment:
                    'COD',

                paymentStatus:
                    'COD',

                status:
                    'Pending',

                selfpickup:
                    false
            });


        restaurant.order.unshift(
            newOrder._id
        );


        user.order.unshift(
            newOrder._id
        );


        await restaurant.save();

        await newOrder.save();


        /*
         * Remove only the selected
         * products from the cart.
         */
        const userWithoutPopulate =
            await User.findById(
                req.user._id
            );


        removeSelectedItemsFromCart(
            userWithoutPopulate,
            selectedFoodIds
        );


        await userWithoutPopulate.save();


        req.session.selectedCartFoodIds =
            null;


        req.flash(
            'success',
            'Your selected items order is placed successfully.'
        );


        res.redirect(
            '/orderhistory'
        );
    })
);


// ============================================================
// DIRECT ONLINE ORDER
// ============================================================

router.post(
    '/direct/pay/online',
    catchAsync(async (req, res) => {

        if (req.user) {

            const directOrder =
                req.session.directOrder;


            if (!directOrder) {

                req.flash(
                    'error',
                    'No direct order found'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            const food =
                await Food.findById(
                    directOrder.foodId
                ).populate(
                    'restaurant'
                );


            if (!food) {

                req.flash(
                    'error',
                    'Food item not found'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            const user =
                await User.findById(
                    req.user._id
                );


            const totals =
                calculateDirectOrderTotals(
                    user,
                    food,
                    directOrder.quantity
                );


            const newOrder =
                new Order({

                    user:
                        user._id,

                    order:
                        buildDirectOrderItems(
                            user,
                            food,
                            directOrder.quantity
                        ),

                    money:
                        totals.total,

                    modeOfPayment:
                        'ONLINE',

                    paymentStatus:
                        'Pending',

                    status:
                        'Pending',

                    selfpickup:
                        false
                });


            food.restaurant.order.unshift(
                newOrder._id
            );


            user.order.unshift(
                newOrder._id
            );


            await food.restaurant.save();

            await user.save();

            await newOrder.save();


            const razorpayOrder =
                await createRazorpayOrder(
                    newOrder,
                    totals.total,
                    req
                );


            res.json(
                razorpayOrder
            );

        } else {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }
    })
);


// ============================================================
// SUCCESSFUL ONLINE PAYMENT
// ============================================================

router.post(
    '/',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const user =
            await User.findById(
                req.user._id
            );


        const order =
            await verifyPendingOnlinePayment(
                req,
                user
            );


        if (order === false) {

            req.flash(
                'error',
                'Payment verification failed'
            );

            return res.redirect(
                '/cart'
            );
        }


        if (!order) {

            req.flash(
                'error',
                'Payment order not found or already processed'
            );

            return res.redirect(
                '/cart'
            );
        }


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        if (
            selectedFoodIds.length > 0
        ) {

            removeSelectedItemsFromCart(
                user,
                selectedFoodIds
            );

            req.session.selectedCartFoodIds =
                null;

        } else {

            user.cart = [];
        }


        await user.save();


        if (
            !order.selfpickup &&
            !order.NGO
        ) {

            req.flash(
                'success',
                'Payment successful! Your restaurant will now process the order.'
            );

        } else if (
            !order.NGO
        ) {

            req.flash(
                'success',
                'Payment Successful!'
            );

        } else {

            req.flash(
                'success',
                'Payment Successful! Your Order will be arrived to your choosen NGO by NPO'
            );
        }


        /*
         * IMPORTANT:
         *
         * Customer should see the newly
         * created order in order history.
         */
        res.redirect(
            '/orderhistory'
        );
    })
);


// ============================================================
// RAZORPAY PAYMENT FAILED
// ============================================================

router.post(
    '/payment/failed',
    catchAsync(async (req, res) => {

        if (
            !req.user ||
            !req.session.pendingOnlineOrderId
        ) {

            return res.status(400).json({
                error:
                    'No pending payment found'
            });
        }


        const order =
            await Order.findOne({

                _id:
                    req.session.pendingOnlineOrderId,

                user:
                    req.user._id,

                modeOfPayment:
                    'ONLINE',

                paymentStatus:
                    'Pending'
            });


        if (!order) {

            return res.status(400).json({
                error:
                    'No pending payment found'
            });
        }


        const razorpayOrderId =
            req.body?.razorpay_order_id;


        if (
            razorpayOrderId &&
            order.transaction?.order_id !==
                razorpayOrderId
        ) {

            return res.status(400).json({
                error:
                    'Payment order does not match'
            });
        }


        /*
         * IMPORTANT:
         *
         * Failed payment must not be
         * processed by the restaurant.
         */
        order.paymentStatus =
            'Failed';

        order.status =
            'Cancelled';


        await order.save();


        req.session.pendingOnlineOrderId =
            null;


        return res.json({
            ok: true,

            orderStatus:
                order.status,

            paymentStatus:
                order.paymentStatus
        });
    })
);


// ============================================================
// VERIFY SELECTED CART PAYMENT
// ============================================================

router.post(
    '/checkout/verify',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const user =
            await User.findById(
                req.user._id
            );


        const order =
            await verifyPendingOnlinePayment(
                req,
                user
            );


        if (order === false) {

            req.flash(
                'error',
                'Payment verification failed'
            );

            return res.redirect(
                '/cart'
            );
        }


        if (!order) {

            req.flash(
                'error',
                'Payment order not found or already processed'
            );

            return res.redirect(
                '/cart'
            );
        }


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        if (
            selectedFoodIds.length > 0
        ) {

            removeSelectedItemsFromCart(
                user,
                selectedFoodIds
            );

            req.session.selectedCartFoodIds =
                null;
        }


        await user.save();


        req.flash(
            'success',
            'Payment Successful!'
        );


        res.redirect(
            '/orderhistory'
        );
    })
);


// ============================================================
// DIRECT ORDER PAYMENT VERIFICATION
// ============================================================

router.post(
    '/direct/verify',
    catchAsync(async (req, res) => {

        if (req.user) {

            const user =
                await User.findById(
                    req.user._id
                );


            const order =
                await verifyPendingOnlinePayment(
                    req,
                    user
                );


            if (order === false) {

                req.flash(
                    'error',
                    'Payment verification failed'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            if (!order) {

                req.flash(
                    'error',
                    'Payment order not found or already processed'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            req.session.directOrder =
                null;


            req.flash(
                'success',
                'Payment Successful!'
            );


            res.redirect(
                '/orderhistory'
            );

        } else {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }
    })
);


// ============================================================
// COD PAYMENT - FULL CART
// ============================================================

router.get(
    '/pay/cod',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const user =
            await req.user.populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const cart =
            user.cart;


        const restaurantId =
            getSingleRestaurantId(
                cart
            );


        if (!restaurantId) {

            req.flash(
                'error',
                'Please checkout items from one restaurant at a time'
            );

            return res.redirect(
                '/cart'
            );
        }


        const restaurant =
            await User.findById(
                restaurantId
            );


        const newCart = [];

        let money = 0;


        cart.forEach(item => {

            let newItem = {};


            if (
                req.user.roles ===
                'customer'
            ) {

                newItem = {

                    food:
                        item.food._id,

                    count:
                        item.count,

                    money:
                        item.food.price *
                        item.count *
                        0.8
                };


                money +=
                    item.food.price *
                    item.count *
                    0.8;

            } else {

                newItem = {

                    food:
                        item.food._id,

                    count:
                        item.count,

                    money:
                        item.food.price *
                        item.count *
                        0.6
                };


                /*
                 * Preserve the existing
                 * calculation behavior.
                 */
                money +=
                    item.food.price *
                    item.count *
                    0.8;
            }


            newCart.push(
                newItem
            );
        });


        const newOrder =
            new Order({

                user:
                    user._id,

                order:
                    newCart,

                money,

                modeOfPayment:
                    'COD',

                paymentStatus:
                    'COD',

                status:
                    'Pending',

                selfpickup:
                    false
            });


        restaurant.order.unshift(
            newOrder._id
        );


        user.order.unshift(
            newOrder._id
        );


        await restaurant.save();

        await newOrder.save();


        user.cart = [];


        await user.save();


        req.flash(
            'success',
            'NPO will assign your order to delivery agent.'
        );


        res.redirect(
            '/cart'
        );
    })
);


// ============================================================
// DIRECT COD ORDER
// ============================================================

router.get(
    '/direct/pay/cod',
    catchAsync(async (req, res) => {

        if (req.user) {

            const directOrder =
                req.session.directOrder;


            if (!directOrder) {

                req.flash(
                    'error',
                    'No direct order found'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            const food =
                await Food.findById(
                    directOrder.foodId
                ).populate(
                    'restaurant'
                );


            if (!food) {

                req.flash(
                    'error',
                    'Food item not found'
                );

                return res.redirect(
                    '/restaurants'
                );
            }


            const user =
                await User.findById(
                    req.user._id
                );


            const totals =
                calculateDirectOrderTotals(
                    user,
                    food,
                    directOrder.quantity
                );


            const newOrder =
                new Order({

                    user:
                        user._id,

                    order:
                        buildDirectOrderItems(
                            user,
                            food,
                            directOrder.quantity
                        ),

                    money:
                        totals.total,

                    modeOfPayment:
                        'COD',

                    paymentStatus:
                        'COD',

                    status:
                        'Pending',

                    selfpickup:
                        false
                });


            food.restaurant.order.unshift(
                newOrder._id
            );


            user.order.unshift(
                newOrder._id
            );


            await food.restaurant.save();

            await newOrder.save();

            await user.save();


            req.session.directOrder =
                null;


            req.flash(
                'success',
                'Your order is placed successfully.'
            );


            res.redirect(
                '/orderhistory'
            );

        } else {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }
    })
);


// ============================================================
// DONATION PAGE
// ============================================================

router.get(
    '/donation',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        const NGOs =
            await User.find({
                roles: 'NGO'
            });


        const user =
            await req.user.populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        const cart =
            selectedFoodIds.length > 0
                ? getSelectedCartItems(
                    user.cart,
                    selectedFoodIds
                )
                : user.cart;


        if (
            cart.length === 0
        ) {

            req.flash(
                'error',
                'No selected items found for donation'
            );

            return res.redirect(
                '/cart'
            );
        }


        res.render(
            'cart/NGO',
            {
                NGOs,
                cart
            }
        );
    })
);


// ============================================================
// DONATION PAYMENT
// ============================================================

router.post(
    '/pay/donate',
    catchAsync(async (req, res) => {

        if (!req.user) {

            req.flash(
                'error',
                'User Must LOGGED IN'
            );

            return res.redirect(
                '/login'
            );
        }


        if (!req.body.NGO) {

            req.flash(
                'error',
                'Select the NGO'
            );

            return res.redirect(
                '/cart/donation'
            );
        }


        const user =
            await req.user.populate({

                path: 'cart',

                populate: {

                    path: 'food',

                    populate: {
                        path: 'restaurant'
                    }
                }
            });


        const selectedFoodIds =
            req.session.selectedCartFoodIds ||
            [];


        const cart =
            selectedFoodIds.length > 0
                ? getSelectedCartItems(
                    user.cart,
                    selectedFoodIds
                )
                : user.cart;


        if (
            cart.length === 0
        ) {

            req.flash(
                'error',
                'No selected items found for donation'
            );

            return res.redirect(
                '/cart'
            );
        }


        const restaurantId =
            getSingleRestaurantId(
                cart
            );


        if (!restaurantId) {

            return res.status(400).json({
                error:
                    'Please donate items from one restaurant at a time'
            });
        }


        const ngo =
            await User.findOne({
                _id: req.body.NGO,
                roles: 'NGO'
            });


        if (!ngo) {

            return res.status(400).json({
                error:
                    'Selected NGO not found'
            });
        }


        const restaurant =
            await User.findById(
                restaurantId
            );


        const newCart = [];


        cart.forEach(item => {

            const newItem = {

                food:
                    item.food._id,

                count:
                    item.count,

                money:
                    item.food.price *
                    item.count *
                    0.6
            };


            newCart.push(
                newItem
            );
        });


        const newOrder =
            new Order({

                user:
                    user._id,

                order:
                    newCart,

                money:
                    req.body.amount,

                modeOfPayment:
                    'ONLINE',

                paymentStatus:
                    'Pending',

                status:
                    'Pending',

                NGO:
                    ngo._id
            });


        restaurant.order.unshift(
            newOrder._id
        );


        user.order.unshift(
            newOrder._id
        );


        await user.save();

        await newOrder.save();

        await restaurant.save();


        const razorpayOrder =
            await createRazorpayOrder(
                newOrder,
                req.body.amount,
                req
            );


        res.json(
            razorpayOrder
        );
    })
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;