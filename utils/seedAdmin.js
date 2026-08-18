const User = require('../models/user');

const getAdminConfig = () => ({
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@foodbridge.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    location: process.env.ADMIN_LOCATION || 'FoodBridge HQ',
    contactNumber: process.env.ADMIN_CONTACT_NUMBER || '9999999999'
});

const buildAdminGeometry = async (location) => {
    const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
    const mapBoxToken = process.env.MAPBOX_TOKEN;

    if (!mapBoxToken) {
        return { type: 'Point', coordinates: [0, 0] };
    }

    try {
        const geocoder = mbxGeocoding({ accessToken: mapBoxToken });
        const geoData = await geocoder.forwardGeocode({
            query: location,
            limit: 1
        }).send();

        const geometry = geoData?.body?.features?.[0]?.geometry;
        if (geometry && geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
            return geometry;
        }
    } catch (err) {
        console.warn('Admin geocoding failed, using fallback geometry:', err.message);
    }

    return { type: 'Point', coordinates: [0, 0] };
};

const ensureDefaultAdmin = async () => {
    const { username, email, password, location, contactNumber } = getAdminConfig();

    const existingAdmin = await User.findOne({
        $or: [{ username }, { email }, { roles: 'Admin' }]
    });

    if (existingAdmin) {
        return existingAdmin;
    }

    const geometry = await buildAdminGeometry(location);
    const admin = new User({
        username,
        email,
        roles: 'Admin',
        location,
        contactNumber,
        geometry,
        image: {
            url: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png',
            filename: 'default-admin-avatar'
        }
    });

    const registeredAdmin = await User.register(admin, password);
    console.log(`Default admin created: username=${username}, email=${email}, password=${password}`);
    return registeredAdmin;
};

module.exports = {
    ensureDefaultAdmin,
    getAdminConfig
};
