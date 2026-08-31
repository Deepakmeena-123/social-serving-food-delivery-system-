const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const DonationSchema = new Schema({

    // ============================================================
    // DONOR INFORMATION
    // ============================================================

    donorType: {
        type: String,
        required: true
    },

    donorId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },

    donorName: {
        type: String
    },


    // ============================================================
    // FOOD INFORMATION
    // ============================================================

    foodId: {
        type: Schema.Types.ObjectId,
        ref: 'food',
        required: true
    },

    foodName: {
        type: String
    },

    donatedQuantity: {
        type: Number,
        required: true
    },


    // ============================================================
    // NGO INFORMATION
    // ============================================================

    ngoId: {
        type: Schema.Types.ObjectId,
        ref: 'user'
    },

    ngoName: {
        type: String
    },


    // ============================================================
    // SOURCE ORDER
    //
    // Used when a customer donates food through an order.
    // ============================================================

    sourceOrder: {
        type: Schema.Types.ObjectId,
        ref: 'order'
    },


    // ============================================================
    // DONATION DATE
    // ============================================================

    donationDate: {
        type: Date,
        default: Date.now
    },


    // ============================================================
    // DONATION STATUS
    //
    // Pending   = NGO has not accepted yet
    // Accepted  = NGO accepted the donation
    // Rejected  = NGO rejected the donation
    // Received  = NGO confirmed that food was received
    // Completed = Donation process completed
    // ============================================================

    status: {
        type: String,
        enum: [
            'Pending',
            'Accepted',
            'Rejected',
            'Received',
            'Completed'
        ],
        default: 'Pending'
    },


    // ============================================================
    // DELIVERY STATUS
    //
    // Pending         = Restaurant has not started preparing
    // Preparing       = Restaurant is preparing the donation
    // OutForDelivery  = Food has left the restaurant
    // Delivered       = Delivery completed
    // Cancelled       = Delivery cancelled
    // ============================================================

    deliveryStatus: {
        type: String,
        enum: [
            'Pending',
            'Preparing',
            'OutForDelivery',
            'Delivered',
            'Cancelled'
        ],
        default: 'Pending'
    },


    // ============================================================
    // RECEIVED TIME
    // ============================================================

    receivedAt: {
        type: Date
    }

});

module.exports = mongoose.model('donation', DonationSchema);