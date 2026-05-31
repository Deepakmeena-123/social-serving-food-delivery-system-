//Main App
if (process.env.NODE_ENV !== "production") {
    require('dotenv').config();
}


const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ejsMate = require('ejs-mate');
const session = require('express-session');
const flash = require('connect-flash');
const ExpressError = require('./utils/ExpressError');
const methodOverride = require('method-override');
const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const User = require('./models/user');
const mongoSanitize = require('express-mongo-sanitize');



const userRoutes = require('./routes/users');
const restaurantRoutes = require('./routes/restaurants')
const cartRoutes = require('./routes/cart')
const adminRoutes = require('./routes/admin')
const MongoDBStore = require("connect-mongo").default;

// const dbUrl = 'mongodb://localhost:27017/NPOTake2'
const isProduction = process.env.NODE_ENV === 'production';
const dbUrl = process.env.DB_URL || process.env.MONGO_URI;

const app = express();

app.engine('ejs', ejsMate)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'))

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')))
// Use sanitize function directly and avoid assigning to `req.query`
// because in some environments `req.query` is a getter-only property.
const { sanitize: sanitizeObject } = mongoSanitize;
app.use((req, res, next) => {
    const options = { replaceWith: '_' };
    try {
        if (req.body) req.body = sanitizeObject(req.body, options);
    } catch (e) {}
    try {
        if (req.params) req.params = sanitizeObject(req.params, options);
    } catch (e) {}
    try {
        if (req.headers) req.headers = sanitizeObject(req.headers, options);
    } catch (e) {}
    // skip sanitizing req.query to avoid "getter-only" assignment errors
    next();
});

const secret = process.env.SECRET || 'thisshouldbeabettersecret';

const store = MongoDBStore.create({
    mongoUrl: dbUrl,
    useUnifiedTopology: true,
    secret,
    touchAfter: 24*60*60
})

store.on("error",(e) => {
    console.log(e);
})

const sessionConfig = {
    name: 'session',
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        // secure: true,
        expires: Date.now() + 1000 * 60 * 60,
        maxAge: 1000 * 60 * 60
    }
}

app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//Localising some variables
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})

app.use('/cart',cartRoutes)
app.use('/', userRoutes);
app.use('/restaurants',restaurantRoutes);
app.use('/admin',adminRoutes)
app.get('/', (req, res) => {
    res.render('home')
});


app.all(/.*/, (req, res, next) => {
    next(new ExpressError('Page Not Found', 404))
})

app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'Oh No, Something Went Wrong!'
    res.status(statusCode).render('error', { err })
})


const port = process.env.PORT || 4000

const start = async () => {
    try {
        await mongoose.connect(dbUrl);
        console.log('Database connected');
        app.listen(port, () => {
            console.log(`Serving on port ${port}`)
        })
    } catch (e) {
        console.error('connection error:', e);
    }
}

start();


