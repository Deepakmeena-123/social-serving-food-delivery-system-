const express = require('express');
const router = express.Router();
const User = require("../models/user")
const Food = require('../models/food');
const Order = require('../models/order');
const PortalTime=require('../models/portal');
const multer = require('multer');
const { storage } = require('../cloudinary');
const upload = multer({ storage });
const catchAsync = require('../utils/catchAsync');

// All restaurant Route
router.get('/',catchAsync(async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const restaurants = await User.find({ roles : 'restaurant'})
    res.render('restaurants/index',{restaurants});
    }
}))

//Menu of Particular Restaurant
router.get('/:id', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    if(req.user.roles !== 'Admin'){
        const portalTime=await PortalTime.find();
        const start = portalTime?.[0]?.start ?? '00:00';
        const end = portalTime?.[0]?.end ?? '23:59';
        const today = new Date();
        const hh = String(today.getHours()).padStart(2, '0');
        const mm = String(today.getMinutes()).padStart(2, '0');
        const time = `${hh}:${mm}`;
        if(start<=time && time<=end){
            const userfind=await User.findById(req.user._id);
            userfind.isOpen=true;
            await userfind.save();
        }
        else{
            const userfind=await User.findById(req.user._id);
            userfind.isOpen=false;
            await userfind.save();
        }
    }
    const restaurant = await User.findById(req.params.id).populate({
        path: 'cart',
        populate: {
            path: 'food'
        }
    })
    if(restaurant.roles != 'restaurant')
    {
        req.flash('error','Invalid ID')
        res.redirect('/restaurants');
        return;
    }
    res.render('restaurants/showmenu',{restaurant})
}
}))

router.get('/:id/dashboard', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error','User Must LOGGED IN');
        return res.redirect('/login');
    }
    if(!req.user._id.equals(req.params.id)) {
        req.flash('error','Not Authorized');
        return res.redirect('/restaurants');
    }

    const restaurant = await User.findById(req.params.id).populate({
        path: 'cart',
        populate: { path: 'food' }
    });

    if(!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error','Restaurant not found');
        return res.redirect('/restaurants');
    }

    const foodIds = restaurant.cart.map(item => item.food && item.food._id).filter(Boolean);
    const restaurantOrders = await Order.find().populate({ path: 'user' }).populate({ path: 'order.food' });
    const filteredOrders = restaurantOrders.filter(order =>
        order.order.some(item => item.food && item.food.restaurant && item.food.restaurant.equals(restaurant._id))
    );

    const recentOrders = filteredOrders
        .sort((a, b) => b._id.getTimestamp() - a._id.getTimestamp())
        .slice(0, 5);

    const Donation = require('../models/donation');
    const recentDonations = await Donation.find({ donorType: 'Restaurant', donorId: restaurant._id })
        .sort({ donationDate: -1 })
        .limit(5);

    const totalFoodItems = restaurant.cart.length;
    const totalOrders = filteredOrders.length;
    const totalDonations = await Donation.countDocuments({ donorType: 'Restaurant', donorId: restaurant._id });
    const pendingOrders = filteredOrders.filter((order) => !['Delivered', 'Cancelled', 'Failed'].includes(order.status)).length;

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

router.get('/:id/orders', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error','User Must LOGGED IN');
        return res.redirect('/login');
    }
    if(!req.user._id.equals(req.params.id)) {
        req.flash('error','Not Authorized');
        return res.redirect('/restaurants');
    }

    const restaurant = await User.findById(req.params.id);
    if(!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error','Restaurant not found');
        return res.redirect('/restaurants');
    }

    const orders = await Order.find().populate({ path: 'user' }).populate({ path: 'order.food' });
    const restaurantOrders = orders.filter(order =>
        order.order.some(item => item.food && item.food.restaurant && item.food.restaurant.equals(restaurant._id))
    );

    const sortedOrders = restaurantOrders.sort((a, b) => b._id.getTimestamp() - a._id.getTimestamp());
    res.render('restaurants/orders', { restaurant, orders: sortedOrders });
}));

//Rendering Add Food Item To The Menu Form
router.get('/:id/add', (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        if(req.user._id.equals(req.params.id)) {
            res.render('restaurants/addFood');
        } else {
            req.flash('error','Not Authorized')
            res.redirect('/restaurants')
        }
    }
})

//Adding Food to the Menu
router.post('/:id',upload.single('image'), catchAsync(async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const { name,count,price,description } = req.body
    const food = new Food({ name,count,price,description })
    if(req.file) {
        food.image = {
            url: req.file.path,
            filename: req.file.filename
        }
    }
    food.restaurant = req.params.id;
    const restaurant = await User.findById(req.params.id);
    const cart = {
        food: food._id,
        count: 0
    }
    restaurant.cart.unshift(cart)
    await restaurant.save()
    await food.save();
    res.redirect(`/restaurants/${restaurant._id}`)
}
}))

// Rendering Editing Food in the Menu Form
router.get('/:id/:foodid/edit', catchAsync(async(req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const food = await Food.findById(req.params.foodid).populate('restaurant')
    res.render('restaurants/editFood',{food})
    }
}))

// Donation Center - render donation selection form for restaurant
router.get('/:id/donations', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error','User Must LOGGED IN')
        return res.redirect('/login')
    }

    if(!req.user._id.equals(req.params.id)) {
        req.flash('error','Not Authorized')
        return res.redirect('/restaurants')
    }

    const restaurant = await User.findById(req.params.id).populate({
        path: 'cart',
        populate: { path: 'food' }
    })
    const ngos = await User.find({ roles: 'NGO' })
    if(!restaurant) {
        req.flash('error','Restaurant not found')
        return res.redirect('/restaurants')
    }

    res.render('restaurants/donations', { restaurant, ngos })
}))

// Submit donation for multiple selected items
router.post('/:id/donations', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error','User Must LOGGED IN')
        return res.redirect('/login')
    }

    if(!req.user._id.equals(req.params.id)) {
        req.flash('error','Not Authorized')
        return res.redirect('/restaurants')
    }

    const { selected } = req.body; // checkbox values (food ids)
    if(!selected) {
        req.flash('error','No items selected for donation')
        return res.redirect(`/restaurants/${req.params.id}/donations`)
    }

    const selectedArr = Array.isArray(selected) ? selected : [selected];
    const ngoId = req.body.NGO
    if(!ngoId) {
        req.flash('error','Please select an NGO to receive the donations')
        return res.redirect(`/restaurants/${req.params.id}/donations`)
    }
    const ngo = await User.findById(ngoId)
    if(!ngo) {
        req.flash('error','Selected NGO not found')
        return res.redirect(`/restaurants/${req.params.id}/donations`)
    }
    const donations = [];

    for(const foodId of selectedArr) {
        const qty = Number.parseInt(req.body[`quantity_${foodId}`])
        const food = await Food.findById(foodId)
        if(!food) {
            req.flash('error',`Food item not found: ${foodId}`)
            return res.redirect(`/restaurants/${req.params.id}/donations`)
        }
        if(!qty || qty < 1 || qty > food.count) {
            req.flash('error',`Invalid quantity for ${food.name}`)
            return res.redirect(`/restaurants/${req.params.id}/donations`)
        }

        const Donation = require('../models/donation');
        const donation = new Donation({
            donorType: 'Restaurant',
            donorId: req.user._id,
            donorName: req.user.username,
            foodId: food._id,
            foodName: food.name,
            donatedQuantity: qty,
            ngoId: ngo._id,
            ngoName: ngo.username,
            status: 'Pending'
        })
        await donation.save();

        food.count = food.count - qty
        await food.save();

        donations.push(donation)
    }

    req.flash('success', `${donations.length} donation request(s) submitted.`)
    res.redirect(`/restaurants/${req.params.id}`)
}))

// Donation History for restaurant
router.get('/:id/donations/history', catchAsync(async (req, res) => {
    if(!req.user){
        req.flash('error','User Must LOGGED IN')
        return res.redirect('/login')
    }

    if(!req.user._id.equals(req.params.id)) {
        req.flash('error','Not Authorized')
        return res.redirect('/restaurants')
    }

    const Donation = require('../models/donation');
    const donations = await Donation.find({ donorType: 'Restaurant', donorId: req.params.id }).sort({ donationDate: -1 })
    res.render('restaurants/donationHistory', { donations })
}))

//Updating Food in the Menu Form
router.put('/:id/:foodid', catchAsync(async (req,res) => {
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
    const {price,count,description} = req.body
    const food = await Food.findById(req.params.foodid)
    food.price = price
    food.description = description
    food.count = count
    await food.save()
    res.redirect(`/restaurants/${req.params.id}`);
    }
}))

//Adding to Cart
router.post('/:foodid/add',catchAsync(async (req,res) => {
    const food = await Food.findById(req.params.foodid).populate('restaurant') 
    if(!req.user){
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else {
        const user = await User.findById(req.user._id);
        const index = user.cart.findIndex((element) => {
            return element.food.equals(req.params.foodid)
        })
        if(index === -1){
            const cartFood = {
                food: food._id,
                count: req.body.count
            }
            user.cart.unshift(cartFood);
        } else {
            user.cart[index].count += Number.parseInt(req.body.count)
        }
        await user.save()
        food.count = food.count - req.body.count
        await food.save()
        req.flash('success', 'Added to cart successfully. Continue shopping!')
    }
    res.redirect(`/restaurants/${food.restaurant._id}`)
}))

//Deleting Food From Menu
router.delete('/:id/:foodid', catchAsync(async(req,res) => {
    const {id ,foodid} = req.params;
    if(!req.user) {
        req.flash('error',"User Must LOGGED IN")
        res.redirect('/login')
    } else if(!req.user._id.equals(id)) {
        req.flash('error',"User is not Authorized")
        res.redirect('/login')
    } else {
        const restaurant = await User.findById(id)
        const menu = restaurant.cart.filter(c => {
            if(!c.food.equals(foodid))
                return c
        })
        restaurant.cart = menu
        await restaurant.save()
        await Food.findByIdAndDelete(foodid)
        res.redirect(`/restaurants/${id}`)
    }
}))

module.exports = router;