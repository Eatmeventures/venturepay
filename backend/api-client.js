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
const request = require('request');
const sessionStore = require('../session-store');
const config = require('../config');

// API vars
var baseUrl = config.merchantUrl;

/**
 * This module handles the integration with the Masterpass Merchant Backend API.
 */
function ApiClient() {

}

ApiClient.prototype.getProducts = function (userId, p, s) {

    var url = baseUrl + '/products?p= ' + p + '&s=' + s;

    var promise = new Promise(function (resolve, reject) {
        request(url, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let xsrfToken = response.headers["set-cookie"][0];
                xsrfToken = xsrfToken.split("=")[1];
                xsrfToken = xsrfToken.split(";")[0];
                sessionStore.userData.get(userId).xsrfToken = xsrfToken;
                console.log(body); // Show the body
                resolve(body);
            }
            else {
                reject(error);
            }
        });
    });

    return promise;
};

ApiClient.prototype.preCheckout = function (userId) {

    var url = baseUrl + '/api/express';

    request.defaults({ jar: true });
    let sessionToken = sessionStore.userData.get(userId).sessionToken;
    var jar = request.jar();
    var session = request.cookie('JSESSIONID=' + sessionToken);
    jar.setCookie(session, url);

    var promise = new Promise(function (resolve, reject) {
        request({
            uri: url,
            method: "GET",
            jar: jar
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body); // Show the body
                resolve(body);
            }
            else {
                reject(response.statusCode);
            }
        });
    });

    return promise;
};

/**
 * This method will create a cart with one product to proceed with the checkout
 */
ApiClient.prototype.buyProduct = function (userId, productId) {
    let promise = new Promise(function (resolve, reject) {

        let callback = function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
                resolve(body);
            }
            else {
                reject(body);
            }
        };

        let url = baseUrl + '/buy';

        request.defaults({ jar: true });
        let sessionToken = sessionStore.userData.get(userId).sessionToken;
        let jar = request.jar();
        let session = request.cookie('JSESSIONID=' + sessionToken);
        jar.setCookie(session, url);

        let xsrfToken = sessionStore.userData.get(userId).xsrfToken;
        let token = request.cookie('XSRF-TOKEN=' + xsrfToken);
        jar.setCookie(token, url);
        let header = { 'X-XSRF-TOKEN': xsrfToken };

        let postData = {
            'productId': productId.toString(),
            'quantity': "1"
        };
        let options = {
            uri: url,
            method: "POST",
            json: postData,
            headers: header,
            jar: jar
        };

        request(options, callback);
    });

    return promise;
};

ApiClient.prototype.expressCheckout = function (userId, cartId, cardId, addressId) {
    let promise = new Promise(function (resolve, reject) {

        let url = baseUrl + '/api/express/' + cartId;

        //The session cookie stores the link between the Merchant User and the FB User.
        //If no link is found, the merchant will return a 404.
        let sessionToken = sessionStore.userData.get(userId).sessionToken;
        let session = request.cookie('JSESSIONID=' + sessionToken);

        //XSRF basic security to stop cross-site attacks.
        let xsrfToken = sessionStore.userData.get(userId).xsrfToken;
        let token = request.cookie('XSRF-TOKEN=' + xsrfToken);

        request.defaults({ jar: true });
        let jar = request.jar();
        jar.setCookie(session, url);
        jar.setCookie(token, url);
        let header = { "X-XSRF-TOKEN": xsrfToken };

        let postData = {
            'cardId': cardId,
            'shippingAddressId': addressId
        };
        let options = {
            uri: url,
            method: "POST",
            headers: header,
            jar: jar,
            json: postData
        };

        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve(body);
            }
            else {
                reject(body);
            }
        });
    });

    return promise;
};

ApiClient.prototype.standardCheckout = function (userId, cartId, cardId, addressId) {
    let promise = new Promise(function (resolve, reject) {

        let url = baseUrl + '/api/standard/' + cartId;

        request.defaults({ jar: true });
        let sessionToken = sessionStore.userData.get(userId).sessionToken;
        let jar = request.jar();
        let session = request.cookie('JSESSIONID=' + sessionToken);
        jar.setCookie(session, url);

        //Set it as a cookie and for header X-XSRF-TOKEN
        let xsrfToken = sessionStore.userData.get(userId).xsrfToken;
        let token = request.cookie('XSRF-TOKEN=' + xsrfToken);
        jar.setCookie(token, url);
        let header = { "X-XSRF-TOKEN": xsrfToken };

        let options = {
            uri: url,
            method: "POST",
            headers: header,
            jar: jar
        };

        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve(body);
            }
            else {
                reject(body);
            }
        });
    });

    return promise;
};

/**
 * This method exchanges a FBID for a valid session cookie linked with a user.
 * The user has to do an Account Linking for this method to work.
 */
ApiClient.prototype.getSessionCookie = function (userId) {
    let promise = new Promise(function (resolve, reject) {

        let callback = function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("Received Session Token = " + body);
                resolve(body);
            }
            else {
                reject(error);
            }
        };

        let url = baseUrl + '/channel/session';
        let base64id = new Buffer('messenger:' + userId).toString('base64');
        let authHeader = { Authorization: 'Basic ' + base64id };

        let options = {
            uri: url,
            method: "GET",
            headers: authHeader
        };

        request(options, callback);
    });

    return promise;
};

ApiClient.prototype.logout = function (userId) {
    let promise = new Promise(function (resolve, reject) {

        let callback = function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log("Received Logout = " + body);
                resolve(body);
            }
            else {
                reject(error);
            }
        };

        let url = baseUrl + '/channel/user';
        let base64id = new Buffer('messenger:' + userId).toString('base64');
        let authHeader = { Authorization: 'Basic ' + base64id };

        let options = {
            uri: url,
            method: "DELETE",
            headers: authHeader
        };

        request(options, callback);
    });

    return promise;
};

module.exports = ApiClient;