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

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const ApiClient = require('./backend/api-client');
const Templates = require('./templates');
const sessionStore = require('./session-store');
const config = require('./config');

//  Config variables
const port = config.port;
var apiClient = new ApiClient();
const token = config.token;

/* ----------------------- Express Server Setup and Handlers ----------------------- */
const app = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.send('Hello Master');
});

// This endpoint will be used by Facebook to validate our webhook
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'masterpass_chatbot') {
        res.send(req.query['hub.challenge']);
    }
    res.send('Error, wrong token');
});

// This endpoint will be used by Facebook to send the messages they receive from Messenger
app.post('/webhook/', function (req, res) {
    let messaging_events = req.body.entry[0].messaging;
    for (let i = 0; i < messaging_events.length; i++) {
        let event = req.body.entry[0].messaging[i];
        let sender = event.sender.id;

        //Create a session object for new users or retrieve for existing ones
        if (!sessionStore.userData.get(sender)) {
            var session = {};
            sessionStore.userData.set(sender, session);
        }

        //Handle text message events
        if (event.message && event.message.text && !event.message.is_echo) {
            let text = event.message.text.toLowerCase();
            console.log("Message Received: " + text);
            switch (text) {
                case "logout":
                    sendMessage(sender, Templates.logout);
                    break;
                case "login":
                    sendMessage(sender, Templates.login);
                    break;
                default:
                    sendMessage(sender, Templates.welcome);
                    break;
            }
        }

        //Handle button postback events
        if (event.postback) {
            let text = event.postback.payload;
            let command = text.split("#")[0];
            let param = text.split("#")[1];
            let param2 = text.split("#")[2];
            switch (command) {
                case "connect":
                    sendMessage(sender, Templates.login);
                    break;
                case "product_catalog":
                    sendProductSelector(sender);
                    break;
                case "buy":
                    if (param && param2) {
                        sessionStore.userData.get(sender).productId = param;
                        sessionStore.userData.get(sender).productName = param2;
                    }
                    sendMessage(sender, Templates.login);
                    break;
                case "resume_purchase":
                case "pre_checkout":
                    if (param && param2) {
                        sessionStore.userData.get(sender).productId = param;
                        sessionStore.userData.get(sender).productName = param2;
                    }
                    preCheckout(sender, (param || sessionStore.userData.get(sender).productId));
                    break;
                case "use_address":
                    sessionStore.userData.get(sender).address = param;
                    sessionStore.userData.get(sender).addressName = param2;
                    sendCardSelector(sender);
                    break;
                case "use_card":
                    sessionStore.userData.get(sender).card = param;
                    sessionStore.userData.get(sender).cardName = param2;
                    sendSummary(sender);
                    break;
                case "change_details":
                    sendAddressSelector(sender);
                    break;
                case "checkout":
                    checkout(sender);
                    break;
            }
            continue;
        }

        //Handle account linking events
        if (event.account_linking && event.account_linking.authorization_code) {
            getSessionCookie(sender);
            sendMessage(sender, Templates.linked);
        } else if (event.account_linking) {
            //sessionStore.userData.get(sender).sessionToken = undefined;
            console.log('loginout');
            apiClient.logout(sender)
                .then(function (response) {
                    console.log('Logout successful');
                    sessionStore.userData.get(sender).sessionToken = undefined;
                })
                .catch(errorCallback);
        }
    }
    res.sendStatus(200);
});

app.listen(port, function () {
    console.log('Listening to port: ' + port);
});

/* ----------------------- Facebook Messenger Common Methods ----------------------- */

/**
 * Main method to post messages to Facebook
 */
function sendMessage(sender, message) {
    console.log("Sending message to: " + sender);
    message.recipient.id = sender;
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: token },
        method: 'POST',
        json: message
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error);
        } else if (response.body.error) {
            console.log('Error Sending Text Message: ', response.body.error);
        }
    });
}

/**
 * Send generic FB Message to the user
 */
function sendTextMessage(sender, text) {
    let message = {
        "recipient": {
            "id": sender
        },
        "message": {
            "text": text
        }
    };
    sendMessage(sender, message);
}

/* ----------------------- Facebook Messenger Message Generators ----------------------- */
function sendProductSelector(sender) {
    let callback = function (response) {

        let products = JSON.parse(response).content;
        let message = Templates.generic;

        message.message.attachment.payload.elements = [];
        for (let i = 0; i < products.length; i++) {
            let product = {};
            product.title = products[i].description;
            product.subtitle = "$" + (products[i].unitPrice / 100).toFixed(2);
            product.image_url = config.merchantUrl + products[i].imageUri;

            //If we have a valid session
            if (sessionStore.userData.get(sender).sessionToken) {
                product.buttons = [{
                    type: "postback",
                    payload: "pre_checkout#" + products[i].id + "#" + products[i].description,
                    title: "Checkout"
                }];
            }
            else {
                product.buttons = [{
                    type: "postback",
                    payload: "buy#" + products[i].id + "#" + products[i].description,
                    title: "Buy"
                }];
            }

            message.message.attachment.payload.elements.push(product);
        }

        sendMessage(sender, message);
    };

    apiClient.getProducts(sender, 0, 5)
        .then(callback)
        .catch(errorCallback);
}

function sendCardSelector(sender) {
    let callback = function (response) {
        let jsonResponse = JSON.parse(response);
        let message = Templates.generic;
        let cards = jsonResponse.cards;

        message.message.attachment.payload.elements = [];
        for (let i = 0; i < cards.length; i++) {
            let card = {};
            card.title = "💳" + cards[i].cardAlias;
            card.subtitle = cards[i].brandName +
                "\nExpires " + cards[i].expiryMonth + "/" + cards[i].expiryYear +
                "\n" + cards[i].billingAddress.city + " " + cards[i].billingAddress.country;
            card.image_url = cards[i].imageUri;
            card.buttons = [{
                type: "postback",
                payload: "use_card#" + cards[i].cardId + "#" + cards[i].cardAlias,
                title: "Use " + cards[i].cardAlias
            }];

            message.message.attachment.payload.elements.push(card);
        }

        sendMessage(sender, message);
    };

    apiClient.preCheckout(sender)
        .then(callback)
        .catch(errorCallback);
}

function sendAddressSelector(sender) {
    let callback = function (response) {
        let jsonResponse = JSON.parse(response);
        let message = Templates.generic;
        let addresses = jsonResponse.shippingAddresses;

        message.message.attachment.payload.elements = [];
        for (let i = 0; i < addresses.length; i++) {
            let address = {};
            address.title = "📍" + (addresses[i].shippingAlias || (addresses[i].city + " " + addresses[i].country));
            address.subtitle = addresses[i].city + " " + addresses[i].country +
                "\n" + addresses[i].line1 + " " + addresses[i].line2;
            if (addresses[i].selectedAsDefault)
                address.subtitle = address.subtitle + " [Default]";
            address.image_url = addresses[i].imageUri;
            address.buttons = [{
                type: "postback",
                payload: "use_address#" + addresses[i].addressId + "#" + (addresses[i].shippingAlias || (addresses[i].city + " " + addresses[i].country)),
                title: "Ship to " + (addresses[i].shippingAlias || (addresses[i].city + " " + addresses[i].country))
            }];

            message.message.attachment.payload.elements.push(address);
        }

        sendMessage(sender, message);
    };

    apiClient.preCheckout(sender)
        .then(callback)
        .catch(errorCallback);
}

function sendSummary(sender) {

    let productName = sessionStore.userData.get(sender).productName;
    let cardName = sessionStore.userData.get(sender).cardName;
    let addressName = sessionStore.userData.get(sender).addressName;
    let total = sessionStore.userData.get(sender).total;
    let summary = "Order Summary" +
        "\n\n📷 " + productName +
        "\n\n📍 Shipping to: " + addressName +
        "\n\n💳 Paying with: " + cardName +
        "\n\n--" +
        "\nTotal of $" + total;

    let message = Templates.getSummary(sender, summary);

    sendMessage(sender, message);
}

/* ----------------------- Session and Checkout Handlers ----------------------- */

/**
 * Get session cookie from backend and store in sessionStore.
 * The api-client uses the sessionToken stored in the sessionStore to authenticate the user.
 */
function getSessionCookie(sender, callback) {

    apiClient.getSessionCookie(sender)
        .then(function (response) {
            sessionStore.userData.get(sender).sessionToken = response;
        })
        .catch(errorCallback);
}

/**
 * Create a new cart with the product selected.
 * The cartID is stored in the sessionStore to process later.
 */
function createCart(userId, productId) {

    apiClient.buyProduct(userId, productId)
        .then(function (response) {
            sessionStore.userData.get(userId).cart = response.id;
        })
        .catch(errorCallback);
}

/**
 * Hndle Masterpass Standard Checkout flow.
 */
function standardCheckout(sender) {

    let cartId = sessionStore.userData.get(sender).cart;
    let cardId = sessionStore.userData.get(sender).card;
    let addressId = sessionStore.userData.get(sender).address;

    apiClient.standardCheckout(sender, cartId, cardId, addressId)
        .then(function (response) {
            console.log(response);
            sendMessage(sender, Templates.buildReceipt(sender, response));
        })
        .catch(errorCallback);
}

/**
 * Handle Masterpass Express Checkout flow.
 * 
 * 1. Call cart endpoint to create cart with the product selected
 * 2. Call the pre checkout endpoint to get the default card and address to process the checkout
 * 3. Call checkout endpoint with cartID, addressID and cardID
 */
function expressCheckout(sender, productId) {

    apiClient.buyProduct(sender, productId)
        .then(function (response) {
            sessionStore.userData.get(sender).cart = response.id;

            apiClient.preCheckout(sender)
                .then(function (response) {
                    let jsonResponse = JSON.parse(response);

                    //Get default address
                    let addresses = jsonResponse.shippingAddresses;
                    for (let i = 0; i < addresses.length; i++) {
                        if (addresses[i].selectedAsDefault)
                            sessionStore.userData.get(sender).address = addresses[i].addressId;
                    }

                    //Get default card
                    let cards = jsonResponse.cards;
                    for (let i = 0; i < cards.length; i++) {
                        if (cards[i].selectedAsDefault)
                            sessionStore.userData.get(sender).card = cards[i].cardId;
                    }

                    //Do expresscheckout
                    let cartId = sessionStore.userData.get(sender).cart;
                    let cardId = sessionStore.userData.get(sender).card;
                    let addressId = sessionStore.userData.get(sender).address;

                    apiClient.expressCheckout(sender, cartId, cardId, addressId)
                        .then(function (response) {
                            console.log(response);
                            sendMessage(sender, Templates.buildReceipt(sender, response));
                        })
                        .catch(errorCallback);
                })
                .catch(errorCallback);
        })
        .catch(errorCallback);
}

function preCheckout(sender, productId) {

    apiClient.buyProduct(sender, productId)
        .then(function (response) {
            sessionStore.userData.get(sender).cart = response.id;
            sessionStore.userData.get(sender).total = (response.total / 100) + 4.95 + 6.19;

            apiClient.preCheckout(sender)
                .then(function (response) {
                    let jsonResponse = JSON.parse(response);

                    //Get default address
                    let addresses = jsonResponse.shippingAddresses;
                    for (let i = 0; i < addresses.length; i++) {
                        if (addresses[i].selectedAsDefault)
                            sessionStore.userData.get(sender).address = addresses[i].addressId;
                        sessionStore.userData.get(sender).addressName = (addresses[i].shippingAlias || (addresses[i].city + " " + addresses[i].country));

                    }

                    //Get default card
                    let cards = jsonResponse.cards;
                    for (let i = 0; i < cards.length; i++) {
                        if (cards[i].selectedAsDefault)
                            sessionStore.userData.get(sender).card = cards[i].cardId;
                        sessionStore.userData.get(sender).cardName = cards[i].cardAlias;
                    }

                    sendSummary(sender);
                })
                .catch(function (error) {
                    //If we receive a 404 it means the Session Token is no longer linked to Masterpass.
                    //Thus we need to logout the user and start the login flow.
                    sendMessage(sender, Templates.login);
                    facebookLogout(sender);
                });
        })
        .catch(errorCallback);
}

function checkout(sender) {

    //Do expresscheckout
    let cartId = sessionStore.userData.get(sender).cart;
    let cardId = sessionStore.userData.get(sender).card;
    let addressId = sessionStore.userData.get(sender).address;

    apiClient.expressCheckout(sender, cartId, cardId, addressId)
        .then(function (response) {
            console.log(response);
            sendMessage(sender, Templates.buildReceipt(sender, response));
        })
        .catch(errorCallback);
}

/**
 * Generic error handler function
 */
function errorCallback(error) {
    //If 404 send login flow
    console.error("Server responded with Status Code: " + error);
}

function facebookLogout(fbid) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: token },
        method: 'POST',
        json: { "psid": fbid }
    }, function (error, response, body) {
        if (error) {
            console.log('Error login out: ', error);
        } else if (response.body.error) {
            console.log('Error login out:', response.body.error);
        }
    });
}