const express = require('express');
const router = express.Router();
const User = require("../models/user")
const Food = require('../models/food');
const Order = require('../models/order')
const Razorpay = require('razorpay')
const razorpay = new Razorpay({
    key_id:process.env.RAZORPAY_KEY,
    key_secret:process.env.RAZORPAY_SECRET
})

const catchAsync = require('../utils/catchAsync')

function calculateDelivery(user, restaurant) {
    if (!user?.geometry?.coordinates || !restaurant?.geometry?.coordinates) {
        return 0;
    }

    const latDiff = user.geometry.coordinates[1] * Math.PI / 180 - restaurant.geometry.coordinates[1] * Math.PI / 180;
    const longDiff = user.geometry.coordinates[0] * Math.PI / 180 - restaurant.geometry.coordinates[0] * Math.PI / 180;
    const a = Math.sin(latDiff / 2) ** 2 + Math.cos(user.geometry.coordinates[1] * Math.PI / 180) * Math.cos(restaurant.geometry.coordinates[1] * Math.PI / 180) * Math.sin(longDiff / 2) ** 2;
    const c = 2 * Math.atan2(a ** 0.5, (1 - a) ** 0.5);
    const distance = c * 6371;

    if (distance < 2) {
        return 0;
    }

    return Number.parseInt(5 * 100 * distance) / 100;
}

function calculateDirectOrderTotals(user, food, count) {
    const quantity = Number.parseInt(count);
    const baseAmount = food.price * quantity;
    const discountedAmount = user.roles === 'customer' ? baseAmount * 0.8 : baseAmount * 0.6;
    const delivery = calculateDelivery(user, food.restaurant);
    const total = Number.parseInt(100 * (discountedAmount + delivery)) / 100;

    return {
        quantity,
        delivery,
        total,
        discountedAmount,
    };
}

function buildDirectOrderItems(user, food, quantity) {
    const money = user.roles === 'customer' ? food.price * quantity * 0.8 : food.price * quantity * 0.6;

    return [{
        food: food._id,
        count: quantity,
        money,
    }];
}

function normalizeSelectedFoodIds(selectedFoodIds) {
    if (!selectedFoodIds) {
        return [];
    }

    if (Array.isArray(selectedFoodIds)) {
        return selectedFoodIds.map((id) => id.toString());
    }

    return [selectedFoodIds.toString()];
}

function getSelectedCartItems(cart, selectedFoodIds) {
    const selectedSet = new Set(selectedFoodIds);
    return cart.filter((item) => selectedSet.has(item.food._id.toString()));
}

function buildOrderItemsFromCart(user, selectedCart) {
    return selectedCart.map((item) => ({
        food: item.food._id,
        count: item.count,
        money: user.roles === 'customer'
            ? item.food.price * item.count * 0.8
            : item.food.price * item.count * 0.6,
    }));
}

function calculateSelectedCartTotal(user, selectedCart) {
    let subtotal = 0;
    selectedCart.forEach((item) => {
        subtotal += user.roles === 'customer'
            ? item.food.price * item.count * 0.8
            : item.food.price * item.count * 0.6;
    });

    const delivery = selectedCart[0] ? calculateDelivery(user, selectedCart[0].food.restaurant) : 0;
    const total = Number.parseInt(100 * (subtotal + delivery)) / 100;

    return { subtotal, delivery, total };
}

function removeSelectedItemsFromCart(user, selectedFoodIds) {
    const selectedSet = new Set(selectedFoodIds);
    user.cart = user.cart.filter((item) => !selectedSet.has(item.food.toString()));
}

//Cart Route for Customer
router.get('/', catchAsync(async(req,res) => {
    if(!req.user) {
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    }
    else {
        const user = await User.findById(req.user._id).populate({
            path: 'cart',
            populate: {
                path: 'food',
                populate: {
                    path: 'restaurant'
                }
            }
        })
        const cart = user.cart
        var money = 0
        for(let i in cart){
           money += cart[i].count*cart[i].food.price
        }
        res.render('cart/index',{ cart, money })
    }
}))

//Store selected cart items for checkout
router.post('/selection', catchAsync(async (req, res) => {
    if(!req.user) {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }

    const selectedFoodIds = normalizeSelectedFoodIds(req.body.selectedFoodIds)
    if(selectedFoodIds.length === 0) {
        req.flash('error', 'Please select at least one food item')
        return res.redirect('/cart')
    }

    req.session.selectedCartFoodIds = selectedFoodIds
    res.redirect('/cart/checkout/confirm')
}))

//Store selected cart items for donation flow
router.post('/selection/donation', catchAsync(async (req, res) => {
    if(!req.user) {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }

    const selectedFoodIds = normalizeSelectedFoodIds(req.body.selectedFoodIds)
    if(selectedFoodIds.length === 0) {
        req.flash('error', 'Please select at least one food item')
        return res.redirect('/cart')
    }

    req.session.selectedCartFoodIds = selectedFoodIds
    res.redirect('/cart/donation')
}))

//Checkout confirmation for selected cart items
router.get('/checkout/confirm', catchAsync(async (req, res) => {
    if(!req.user) {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }

    const selectedFoodIds = req.session.selectedCartFoodIds || []
    if(selectedFoodIds.length === 0) {
        req.flash('error', 'Please select items from cart first')
        return res.redirect('/cart')
    }

    const user = await User.findById(req.user._id).populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })

    const selectedCart = getSelectedCartItems(user.cart, selectedFoodIds)
    if(selectedCart.length === 0) {
        req.flash('error', 'No selected items found in cart')
        return res.redirect('/cart')
    }

    const totals = calculateSelectedCartTotal(user, selectedCart)
    res.render('cart/confirmOrder', {
        selectedCart,
        subtotal: totals.subtotal,
        delivery: totals.delivery,
        total: totals.total,
    })
}))

//Direct Order Confirmation Page
router.post('/place-order/:foodid', catchAsync(async (req, res) => {
    if (req.user) {
        const food = await Food.findById(req.params.foodid).populate('restaurant')
        if(!food) {
            req.flash('error', 'Food item not found')
            return res.redirect('/restaurants')
        }

        const quantity = Number.parseInt(req.body.count)
        if(!quantity || quantity < 1 || quantity > food.count) {
            req.flash('error', 'Please select a valid quantity')
            return res.redirect(`/restaurants/${food.restaurant._id}`)
        }

        const user = await User.findById(req.user._id)
        const totals = calculateDirectOrderTotals(user, food, quantity)

        req.session.directOrder = {
            foodId: food._id.toString(),
            restaurantId: food.restaurant._id.toString(),
            quantity,
            total: totals.total,
        }

        res.render('cart/placeOrder', {
            food,
            quantity,
            delivery: totals.delivery,
            total: totals.total,
            discountedAmount: Number.parseInt(100 * totals.discountedAmount) / 100,
        })
    } else {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }
}))

//Updating Item in Cart
router.put('/:foodid', catchAsync(async(req,res) => {
    const { count } = req.body
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const food = await Food.findById(req.params.foodid)
        const user = await User.findById(req.user._id)
        const index = user.cart.findIndex((element) => {
            return element.food.equals(req.params.foodid)
        })
        if(index === -1)
            req.flash('error',"Something Went Wrong")
        else {
            const diff = req.body.count - user.cart[index].count
            user.cart[index].count += parseInt(diff)
            food.count = food.count - diff
            await food.save();
            await user.save();
        }
        res.redirect('/cart')
    }
}))

//Deleting Item in Cart
router.delete('/:foodid', catchAsync(async(req,res) => {

    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const food = await Food.findById(req.params.foodid)
        const user = await User.findById(req.user._id)
        const index = user.cart.findIndex((element) => {
            return element.food.equals(req.params.foodid)
        })
        if(index === -1)
            req.flash('error',"Something Went Wrong")
        else {
            food.count = food.count + user.cart[index].count
            const cart = user.cart.filter(c => {
                if(!c.food.equals(req.params.foodid))
                    return c
            })
            user.cart = cart
            await food.save();
            await user.save();
        }
        res.redirect('/cart')
    }
}))

//Online Payment
router.post('/pay/online',catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    let options = {
        amount:req.body.amount*100,
        currency: "INR"
    }
    const user = await req.user.populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })
    const restaurant = await User.findById(user.cart[0].food.restaurant._id)
    const cart = user.cart
    const newCart = []
    cart.forEach(item=> {
        let  newItem = {}
        if(req.user.roles === 'customer'){
            newItem = {
                food: item.food._id,
                count: item.count,
                money: item.food.price*item.count*0.8
            }
        } else {
            newItem = {
                food: item.food._id,
                count: item.count,
                money: item.food.price*item.count*0.6
            }
        }
        newCart.push(newItem)
    })

    const newOrder = new Order({ 
        user: user._id,
        order: newCart, 
        money: req.body.amount,
        modeOfPayment:"ONLINE",
        selfpickup: req.body.selfpickup
    })
    restaurant.order.unshift(newOrder._id)
    user.order.unshift(newOrder._id)
    await user.save()
    await newOrder.save()
    await restaurant.save()
    razorpay.orders.create(options, (err,order) => {
        res.json(order)
    })
}
}))

//Online Payment for selected cart items
router.post('/checkout/pay/online', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const selectedFoodIds = req.session.selectedCartFoodIds || []
    if(selectedFoodIds.length === 0) {
        req.flash('error', 'Please select items from cart first')
        return res.redirect('/cart')
    }

    const user = await User.findById(req.user._id).populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })

    const selectedCart = getSelectedCartItems(user.cart, selectedFoodIds)
    if(selectedCart.length === 0) {
        req.flash('error', 'No selected items found in cart')
        return res.redirect('/cart')
    }

    const totals = calculateSelectedCartTotal(user, selectedCart)
    const restaurant = await User.findById(selectedCart[0].food.restaurant._id)
    const newOrder = new Order({
        user: user._id,
        order: buildOrderItemsFromCart(user, selectedCart),
        money: totals.total,
        modeOfPayment: 'ONLINE',
        selfpickup: false
    })

    restaurant.order.unshift(newOrder._id)
    user.order.unshift(newOrder._id)
    await user.save()
    await newOrder.save()
    await restaurant.save()

    const options = {
        amount: totals.total * 100,
        currency: 'INR'
    }

    razorpay.orders.create(options, (err,order) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to create Razorpay order' })
        }
        res.json(order)
    })
}))

//COD for selected cart items
router.post('/checkout/pay/cod', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const selectedFoodIds = req.session.selectedCartFoodIds || []
    if(selectedFoodIds.length === 0) {
        req.flash('error', 'Please select items from cart first')
        return res.redirect('/cart')
    }

    const user = await User.findById(req.user._id).populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })

    const selectedCart = getSelectedCartItems(user.cart, selectedFoodIds)
    if(selectedCart.length === 0) {
        req.flash('error', 'No selected items found in cart')
        return res.redirect('/cart')
    }

    const totals = calculateSelectedCartTotal(user, selectedCart)
    const restaurant = await User.findById(selectedCart[0].food.restaurant._id)

    const newOrder = new Order({
        user: user._id,
        order: buildOrderItemsFromCart(user, selectedCart),
        money: totals.total,
        modeOfPayment:"COD",
        selfpickup: false
    })
    newOrder.status = 'Success'

    restaurant.order.unshift(newOrder._id)
    user.order.unshift(newOrder._id)
    await restaurant.save()
    await newOrder.save()

    const userWithoutPopulate = await User.findById(req.user._id)
    removeSelectedItemsFromCart(userWithoutPopulate, selectedFoodIds)
    await userWithoutPopulate.save()
    req.session.selectedCartFoodIds = null

    req.flash('success','Your selected items order is placed successfully.')
    res.redirect('/orderhistory')
}))

//Direct Order Online Payment
router.post('/direct/pay/online', catchAsync(async (req, res) => {
    if (req.user) {
        const directOrder = req.session.directOrder
        if(!directOrder) {
            req.flash('error', 'No direct order found')
            return res.redirect('/restaurants')
        }

        const food = await Food.findById(directOrder.foodId).populate('restaurant')
        if(!food) {
            req.flash('error', 'Food item not found')
            return res.redirect('/restaurants')
        }

        const user = await User.findById(req.user._id)
        const totals = calculateDirectOrderTotals(user, food, directOrder.quantity)

        const newOrder = new Order({
            user: user._id,
            order: buildDirectOrderItems(user, food, directOrder.quantity),
            money: totals.total,
            modeOfPayment: 'ONLINE',
            selfpickup: false,
        })

        food.restaurant.order.unshift(newOrder._id)
        user.order.unshift(newOrder._id)
        await food.restaurant.save()
        await user.save()
        await newOrder.save()

        const options = {
            amount: totals.total * 100,
            currency: 'INR'
        }

        razorpay.orders.create(options, (err, order) => {
            if (err) {
                return res.status(500).json({ error: 'Unable to create Razorpay order' })
            }
            res.json(order)
        })
    } else {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }
}))

//Successful Payment
router.post('/',catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const user = await User.findById(req.user._id)
    const order = await Order.findById(user.order[0])
    order.status = 'Success'
    const transaction = {
        payment_id : req.body.razorpay_payment_id,
        order_id : req.body.razorpay_order_id,
        signature : req.body.razorpay_signature
    }
    order.transaction = transaction
    await order.save()
    const selectedFoodIds = req.session.selectedCartFoodIds || []
    if (selectedFoodIds.length > 0) {
        removeSelectedItemsFromCart(user, selectedFoodIds)
        req.session.selectedCartFoodIds = null
    } else {
        user.cart = []
    }
    await user.save()
    if(!order.selfpickup && !order.NGO)
        req.flash('success','Payment Successful! You will receive a call from Delivery Agent assigned by NPO')
    else if(!order.NGO)
        req.flash('success','Payment Successful!')
    else
        req.flash('success', 'Payment Successful! Your Order will be arrived to your choosen NGO by NPO')
    res.redirect('/cart')
}
}))

//Successful Payment for selected cart checkout
router.post('/checkout/verify',catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        return res.redirect('/login')
    }

    const user = await User.findById(req.user._id)
    const order = await Order.findById(user.order[0])
    if(!order) {
        req.flash('error', 'Order not found')
        return res.redirect('/cart')
    }

    order.status = 'Success'
    const transaction = {
        payment_id : req.body.razorpay_payment_id,
        order_id : req.body.razorpay_order_id,
        signature : req.body.razorpay_signature
    }
    order.transaction = transaction
    await order.save()

    const selectedFoodIds = req.session.selectedCartFoodIds || []
    if (selectedFoodIds.length > 0) {
        removeSelectedItemsFromCart(user, selectedFoodIds)
        req.session.selectedCartFoodIds = null
    }
    await user.save()

    req.flash('success','Payment Successful!')
    res.redirect('/orderhistory')
}))

//Direct Order Payment Verification
router.post('/direct/verify', catchAsync(async (req, res) => {
    if (req.user) {
        const user = await User.findById(req.user._id)
        const order = await Order.findById(user.order[0])

        if(!order) {
            req.flash('error', 'Order not found')
            return res.redirect('/restaurants')
        }

        order.status = 'Success'
        order.transaction = {
            payment_id: req.body.razorpay_payment_id,
            order_id: req.body.razorpay_order_id,
            signature: req.body.razorpay_signature,
        }
        await order.save()
        req.session.directOrder = null
        req.flash('success', 'Payment Successful!')
        res.redirect('/orderhistory')
    } else {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }
}))

//Payment through COD
router.get('/pay/cod', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const user = await req.user.populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })
    const restaurant = await User.findById(user.cart[0].food.restaurant._id)
    const cart = user.cart
    const newCart = []
    let money = 0
    cart.forEach(item=> {
        let  newItem = {}
        if(req.user.roles === 'customer'){
            newItem = {
                food: item.food._id,
                count: item.count,
                money: item.food.price*item.count*0.8
            }
            money = money + item.food.price*item.count*0.8
        } else {
            newItem = {
                food: item.food._id,
                count: item.count,
                money: item.food.price*item.count*0.6
            }
            money = money + item.food.price*item.count*0.8
        }
        newCart.push(newItem)
    })

    const newOrder = new Order({ 
        user: user._id,
        order: newCart, 
        money: money,
        modeOfPayment:"COD",
        selfpickup: false
    })
    newOrder.status = 'Success'
    restaurant.order.unshift(newOrder._id)
    user.order.unshift(newOrder._id)
    await restaurant.save()
    await newOrder.save()
    user.cart = []
    await user.save()
    req.flash('success','NPO will assign your order to delivery agent.')
    res.redirect('/cart')
}
}))

//Direct Order Cash on Delivery
router.get('/direct/pay/cod', catchAsync(async (req, res) => {
    if (req.user) {
        const directOrder = req.session.directOrder
        if(!directOrder) {
            req.flash('error', 'No direct order found')
            return res.redirect('/restaurants')
        }

        const food = await Food.findById(directOrder.foodId).populate('restaurant')
        if(!food) {
            req.flash('error', 'Food item not found')
            return res.redirect('/restaurants')
        }

        const user = await User.findById(req.user._id)
        const totals = calculateDirectOrderTotals(user, food, directOrder.quantity)

        const newOrder = new Order({
            user: user._id,
            order: buildDirectOrderItems(user, food, directOrder.quantity),
            money: totals.total,
            modeOfPayment: 'COD',
            selfpickup: false,
        })

        newOrder.status = 'Success'
        food.restaurant.order.unshift(newOrder._id)
        user.order.unshift(newOrder._id)
        await food.restaurant.save()
        await newOrder.save()
        req.session.directOrder = null
        req.flash('success', 'Your order is placed successfully.')
        res.redirect('/orderhistory')
    } else {
        req.flash('error', 'User Must LOGGED IN')
        return res.redirect('/login')
    }
}))

//Donate To NGO route
router.get('/donation', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const NGOs = await User.find({ roles: 'NGO' })
    const user = await req.user.populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })
    const selectedFoodIds = req.session.selectedCartFoodIds || []
    const cart = selectedFoodIds.length > 0 ? getSelectedCartItems(user.cart, selectedFoodIds) : user.cart
    if(cart.length === 0) {
        req.flash('error', 'No selected items found for donation')
        return res.redirect('/cart')
    }
    res.render('cart/NGO',{ NGOs, cart })
}
}))

//Paying Donation Amount
router.post('/pay/donate', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    if(!req.body.NGO){
        req.flash('error','Select the NGO')
        res.redirect('/cart/donation')
    }
    let options = {
        amount:req.body.amount*100,
        currency: "INR"
    }

    const user = await req.user.populate({
        path: 'cart',
        populate: {
            path: 'food',
            populate: {
                path: 'restaurant'
            }
        }
    })
    const restaurant = await User.findById(user.cart[0].food.restaurant._id)

    const selectedFoodIds = req.session.selectedCartFoodIds || []
    const cart = selectedFoodIds.length > 0 ? getSelectedCartItems(user.cart, selectedFoodIds) : user.cart
    if(cart.length === 0) {
        req.flash('error', 'No selected items found for donation')
        return res.redirect('/cart')
    }
    const newCart = []
    cart.forEach(item=> {
        let  newItem = {}
        
        newItem = {
            food: item.food._id,
            count: item.count,
            money: item.food.price*item.count*0.6
        }
        newCart.push(newItem)
    })

    const newOrder = new Order({ 
        user: user._id,
        order: newCart, 
        money: req.body.amount,
        modeOfPayment:"ONLINE",
        NGO: req.body.NGO
    })
    restaurant.order.unshift(newOrder._id)

    user.order.unshift(newOrder._id)
    await user.save()
    await newOrder.save()
    await restaurant.save()

    razorpay.orders.create(options, (err,order) => {
        res.json(order)
    })
}
}))


module.exports = router;