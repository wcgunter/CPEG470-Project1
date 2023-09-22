// auth.js

/**
 * Required External Modules
 */

const express = require("express");
const router = express.Router();
const passport = require("passport");
const querystring = require("querystring");
const _ = require("lodash");

require("dotenv").config();

let envs;

if (!("error" in result)) {
  envs = result.parsed;
} else {
  envs = {};
  _.each(process.env, (value, key) => {
    envs[key] = value;
    console.log("Adding env var: " + key + " = " + value);
  });
}

/**
 * Routes Definitions
 */

router.get("/login", passport.authenticate("auth0", {
    scope: "openid email profile"
    }),
    (req, res) => {
        res.redirect("/");
    }
);

router.get("/callback", (req, res, next) => {
    passport.authenticate("auth0", (err, user, info) => {
        if(err) {
            return next(err);
        }
        if(!user) {
            return res.redirect("/login");
        }
        req.logIn(user, (err) => {
            if(err) {
                return next(err);
            }
            const returnTo = req.session.returnTo;
            delete req.session.returnTo;
            res.redirect("/user");
        });
    })(req, res, next);
});

router.get("/logout", (req, res) => {
  req.logOut(function(err) {
    if (err) {
        return next(err);
    }
    let returnTo = req.protocol + "://" + req.hostname;
    const port = req.connection.localPort;
  
    if (port !== undefined && port !== 80 && port !== 443) {
      returnTo =
        envs["NODE_ENV"] === "production"
          ? `${returnTo}/`
          : `${returnTo}:${port}/`;
    }
  
    const logoutURL = new URL(
      `https://${envs["AUTH0_DOMAIN"]}/v2/logout`
    );
  
    const searchString = querystring.stringify({
      client_id: envs["AUTH0_CLIENT_ID"],
      returnTo: returnTo
    });
    logoutURL.search = searchString;
  
    res.redirect(logoutURL);
  });
});

/**
 * Module Exports
 */

module.exports = router;