/*
 * Copyright 2016 MasterCard International.
 *
 * Redistribution and use in source and binary forms, with or without modification, are 
 * permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list of 
 * conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * Neither the name of the MasterCard International Incorporated nor the names of its 
 * contributors may be used to endorse or promote products derived from this software 
 * without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES 
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT 
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, 
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; 
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER 
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING 
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF 
 * SUCH DAMAGE.
 *
 */
const config = require('./config');

/**
 * This module stores the generic templates to be used by the chatbot.
 */
function Templates() {
}

Templates.welcome = {
    recipient: { id: "SENDER_ID" },
    message: {
        attachment: {
            type: "template",
            payload: {
                template_type: "generic",
                elements: [{
                    title: "Welcome to AnyCamera 📷",
                    subtitle: "Browse our product catalog and pay with Masterpass!",
                    image_url: "http://demo.labs.mastercard.com/apps/common-assets/cameras.jpg",
                    buttons: [{
                        type: "postback",
                        payload: "product_catalog",
                        title: "Product Catalog"
                    }]
                }]
            }
        }
    }
};

Templates.login = {
    "recipient": {
        "id": "SENDER_ID"
    },
    "message": {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Login to Masterpass",
                    "image_url": "http://demo.labs.mastercard.com/apps/common-assets/mc_black_logo.png",
                    "buttons": [{
                        "type": "account_link",
                        "url": config.merchantUrl + "/example/facebook"
                    }]
                }]
            }
        }
    }
};

Templates.logout = {
    "recipient": {
        "id": "SENDER_ID"
    },
    "message": {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "Log Out from Masterpass",
                    "image_url": "http://demo.labs.mastercard.com/apps/common-assets/mc_black_logo.png",
                    "buttons": [{
                        "type": "account_unlink"
                    }]
                }]
            }
        }
    }
};

Templates.buildReceipt = function (sender, receipt) {
    let receiptMessage = {
        "recipient": {
            "id": sender
        },
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "receipt",
                    "recipient_name": receipt.recipientName,
                    "order_number": receipt.orderNumber,
                    "currency": "USD",
                    "order_url": "http://www.mastercard.com",
                    "payment_method": "Masterpass",
                    "timestamp": Math.floor(Date.now() / 1000),
                    "elements": [
                        {
                            "title": receipt.cart.cartItems[0].description,
                            "subtitle": "AnyCamera 35 Days Warranty Included",
                            "quantity": 1,
                            "price": receipt.cart.cartItems[0].unitPrice / 100,
                            "currency": "USD",
                            "image_url": config.merchantUrl + receipt.cart.cartItems[0].imageUri
                        }
                    ],
                    "address": {
                        "street_1": receipt.line1,
                        "street_2": receipt.line2,
                        "city": receipt.city,
                        "state": "NA",
                        "postal_code": receipt.postalCode,
                        "country": receipt.country
                    },
                    "summary": {
                        "subtotal": receipt.cart.cartItems[0].unitPrice / 100,
                        "shipping_cost": 4.95,
                        "total_tax": 6.19,
                        "total_cost": (receipt.cart.cartItems[0].unitPrice / 100) + 4.95 + 6.19
                    }
                }
            }
        }
    };

    return receiptMessage;
};

Templates.linked = {
    "recipient": {
        "id": "SENDER_ID"
    },
    "message": {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": "✔️ Masterpass linked\nYou can continue shopping now",
                "buttons": [
                    {
                        "type": "postback",
                        "title": "Resume Purchase",
                        "payload": "resume_purchase"
                    }
                ]
            }
        }
    }
};

Templates.generic = {
    'recipient': { id: "SENDER_ID" },
    'message': {
        'attachment': {
            'type': "template",
            'payload': {
                'template_type': "generic",
                'elements': []
            }
        }
    }
};

Templates.getSummary = function(sender, summary){
    return {
        "recipient": {
            "id": sender
        },
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": summary,
                    "buttons": [
                        {
                            "type": "postback",
                            "title": "Pay with Masterpass",
                            "payload": "checkout"
                        },
                        {
                            "type": "postback",
                            "title": "Change Details",
                            "payload": "change_details"
                        }
                    ]
                }
            }
        }
    };
};

module.exports = Templates;