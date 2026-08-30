// Order Model

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'user',
            required: true
        },

        order: [
            {
                food: {
                    type: Schema.Types.ObjectId,
                    ref: 'food',
                    required: true
                },

                count: {
                    type: Number,
                    required: true,
                    min: 1
                },

                money: {
                    type: Number,
                    required: true,
                    min: 0
                }
            }
        ],

        // Final order amount
        money: {
            type: Number,
            required: true,
            min: 0
        },

        // COD / ONLINE
        modeOfPayment: {
            type: String,
            default: 'COD'
        },

        /*
         * Payment status is separate from order/delivery status.
         *
         * COD:
         * paymentStatus = "COD"
         *
         * ONLINE:
         * Pending -> Paid
         * or
         * Pending -> Failed
         */
        paymentStatus: {
            type: String,
            enum: [
                'Pending',
                'Paid',
                'Failed',
                'COD'
            ],
            default: 'Pending'
        },

        /*
         * Actual order lifecycle.
         *
         * Pending
         *     ↓
         * Confirmed
         *     ↓
         * Preparing
         *     ↓
         * OutForDelivery
         *     ↓
         * Delivered
         *
         * Alternative:
         * Pending -> Rejected
         * Pending -> Cancelled
         */
        status: {
            type: String,
            enum: [
                'Pending',
                'Confirmed',
                'Preparing',
                'OutForDelivery',
                'Delivered',
                'Rejected',
                'Cancelled',
                // Keep Success temporarily for old database records.
                'Success',
                'Failed'
            ],
            default: 'Pending'
        },

        /*
         * Razorpay transaction information.
         */
        transaction: {
            payment_id: {
                type: String
            },

            order_id: {
                type: String
            },

            signature: {
                type: String
            }
        },

        /*
         * Optional NGO associated with this order.
         */
        NGO: {
            type: Schema.Types.ObjectId,
            ref: 'user'
        },

        /*
         * Existing self-pickup functionality.
         */
        selfpickup: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);


/*
 * Central list of valid order statuses.
 *
 * Other files can use:
 *
 * Order.ORDER_STATUSES
 */
OrderSchema.statics.ORDER_STATUSES = Object.freeze([
    'Pending',
    'Confirmed',
    'Preparing',
    'OutForDelivery',
    'Delivered',
    'Rejected',
    'Cancelled'
]);


/*
 * Central list of valid payment statuses.
 */
OrderSchema.statics.PAYMENT_STATUSES = Object.freeze([
    'Pending',
    'Paid',
    'Failed',
    'COD'
]);


/*
 * Valid order transitions.
 *
 * This is kept in the model so all routes can use the same rules.
 */
OrderSchema.statics.ORDER_TRANSITIONS = Object.freeze({
    Pending: [
        'Confirmed',
        'Rejected',
        'Cancelled'
    ],

    Confirmed: [
        'Preparing',
        'Cancelled'
    ],

    Preparing: [
        'OutForDelivery',
        'Cancelled'
    ],

    OutForDelivery: [
        'Delivered'
    ],

    Delivered: [],

    Rejected: [],

    Cancelled: [],

    // Old records only.
    Success: [
        'Delivered',
        'Cancelled'
    ],

    Failed: []
});


/*
 * Helper to check whether an order transition is valid.
 */
OrderSchema.statics.isValidTransition = function (
    currentStatus,
    nextStatus
) {
    const allowedTransitions =
        this.ORDER_TRANSITIONS[currentStatus] || [];

    return allowedTransitions.includes(nextStatus);
};


/*
 * Export model.
 */
module.exports = mongoose.model('order', OrderSchema);