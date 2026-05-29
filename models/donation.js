const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DonationSchema = new Schema({
    donorType: {
        type: String,
        required: true,
    },
    donorId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    donorName: String,
    foodId: {
        type: Schema.Types.ObjectId,
        ref: 'food',
        required: true
    },
    foodName: String,
    donatedQuantity: {
        type: Number,
        required: true
    },
    ngoId: {
        type: Schema.Types.ObjectId,
        ref: 'user'
    },
    ngoName: String,
    donationDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        default: 'Pending'
    }
});

module.exports = mongoose.model('donation', DonationSchema);
