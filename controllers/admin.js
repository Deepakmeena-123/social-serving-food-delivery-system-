const User = require('../models/user');
const Donation = require('../models/donation');
const Order = require('../models/order');

const ADMIN_ROLES = new Set(['Admin']);

const isAdminUser = (user) => user && ADMIN_ROLES.has(user.roles);

const requireAdmin = async (req, res) => {
    if (!req.user) {
        req.flash('error', 'User Must LOGGED IN');
        return false;
    }

    const user = await User.findById(req.user._id);
    if (!isAdminUser(user)) {
        req.flash('error', 'User is not Authorized');
        return false;
    }

    return true;
};

const renderAdminView = async (req, res, view, data = {}) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return null;
    }

    return res.render(view, data);
};

module.exports.dashboard = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const [totalUsers, totalRestaurants, totalNGOs, totalDonations, pendingDonations, acceptedDonations] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ roles: 'restaurant' }),
        User.countDocuments({ roles: 'NGO' }),
        Donation.countDocuments({}),
        Donation.countDocuments({ status: 'Pending' }),
        Donation.countDocuments({ status: 'Accepted' })
    ]);

    return res.render('admin/index', {
        totalUsers,
        totalRestaurants,
        totalNGOs,
        totalDonations,
        pendingDonations,
        acceptedDonations,
        distributedDonations: acceptedDonations
    });
};

module.exports.profile = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const admin = await User.findById(req.user._id);
    return res.render('admin/profile', { admin });
};

module.exports.listUsers = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const users = await User.find({}).sort({ createdAt: -1 });
    return res.render('admin/users', { users });
};

module.exports.userDetails = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const user = await User.findById(req.params.id);
    if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/admin/users');
    }

    return res.render('admin/userShow', { user });
};

module.exports.toggleUser = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const user = await User.findById(req.params.id);
    if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/admin/users');
    }

    if (user.roles === 'Admin' || user._id.equals(req.user._id)) {
        req.flash('error', 'This account cannot be disabled');
        return res.redirect(`/admin/users/${user._id}`);
    }

    user.isOpen = !user.isOpen;
    await user.save();
    req.flash('success', `User ${user.isOpen ? 'enabled' : 'disabled'} successfully`);
    return res.redirect(`/admin/users/${user._id}`);
};

module.exports.listRestaurants = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const restaurants = await User.find({ roles: 'restaurant' }).sort({ createdAt: -1 });
    return res.render('admin/restaurants', { restaurants });
};

module.exports.restaurantDetails = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const restaurant = await User.findById(req.params.id);
    if (!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error', 'Restaurant not found');
        return res.redirect('/admin/restaurants');
    }

    return res.render('admin/restaurantShow', { restaurant });
};

module.exports.toggleRestaurant = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const restaurant = await User.findById(req.params.id);
    if (!restaurant || restaurant.roles !== 'restaurant') {
        req.flash('error', 'Restaurant not found');
        return res.redirect('/admin/restaurants');
    }

    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();
    req.flash('success', `Restaurant ${restaurant.isOpen ? 'enabled' : 'disabled'} successfully`);
    return res.redirect(`/admin/restaurants/${restaurant._id}`);
};

module.exports.listNGOs = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const ngos = await User.find({ roles: 'NGO' }).sort({ createdAt: -1 });
    return res.render('admin/ngos', { ngos });
};

module.exports.ngoDetails = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const ngo = await User.findById(req.params.id);
    if (!ngo || ngo.roles !== 'NGO') {
        req.flash('error', 'NGO not found');
        return res.redirect('/admin/ngos');
    }

    const totalFoodDistributedDocs = await Donation.find({ ngoId: ngo._id, status: 'Accepted' }).select('donatedQuantity');
    const totalFoodDistributed = totalFoodDistributedDocs.reduce((total, donation) => total + (donation.donatedQuantity || 0), 0);

    return res.render('admin/ngoShow', { ngo, totalFoodDistributed });
};

module.exports.toggleNgo = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const ngo = await User.findById(req.params.id);
    if (!ngo || ngo.roles !== 'NGO') {
        req.flash('error', 'NGO not found');
        return res.redirect('/admin/ngos');
    }

    ngo.isOpen = !ngo.isOpen;
    await ngo.save();
    req.flash('success', `NGO ${ngo.isOpen ? 'enabled' : 'disabled'} successfully`);
    return res.redirect(`/admin/ngos/${ngo._id}`);
};

module.exports.monitorDonations = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const donations = await Donation.find({})
        .populate('donorId')
        .populate('ngoId')
        .populate('foodId')
        .sort({ donationDate: -1 });

    return res.render('admin/donations', { donations });
};

module.exports.reports = async (req, res) => {
    const allowed = await requireAdmin(req, res);
    if (!allowed) {
        return res.redirect('/restaurants');
    }

    const [donations, totalRestaurants, totalNGOs] = await Promise.all([
        Donation.find({}).select('donatedQuantity status'),
        User.countDocuments({ roles: 'restaurant' }),
        User.countDocuments({ roles: 'NGO' })
    ]);

    const totalDonations = donations.length;
    const totalFoodDonated = donations.reduce((sum, donation) => sum + (donation.donatedQuantity || 0), 0);
    const totalFoodDistributed = donations
        .filter((donation) => donation.status === 'Accepted')
        .reduce((sum, donation) => sum + (donation.donatedQuantity || 0), 0);

    return res.render('admin/reports', {
        totalFoodDonated,
        totalFoodDistributed,
        totalDonations,
        totalRestaurants,
        totalNGOs
    });
};

module.exports.adminOnly = requireAdmin;