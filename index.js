// index.js

/**
 * Required External Modules
 */

const express = require("express");
const mongo = require("mongodb");
const path = require("path");
const _ = require("lodash");

const dotenv = require("dotenv");

const expressSession = require("express-session");
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");

const result = dotenv.config();

var MongoClient = require('mongodb').MongoClient;
var mongoUrl = process.env.DATABASE_URI;

let envs;

if (!("error" in result)) {
  envs = result.parsed;
} else {
  envs = {};
  _.each(process.env, (value, key) => {
    envs[key] = value;
  });
}

const authRouter = require("./auth");

/**
 * App Variables
 */

const app = express();
const port = envs["PORT"] || "8000";

/**
 * Session Configuration (New!)
 */

const session = {
  secret: envs["SESSION_SECRET"],
  cookie: {},
  resave: false,
  saveUninitialized: false
};

if (app.get("env") === "production") {
  // Serve secure cookies, requires HTTPS
  session.cookie.secure = true;
}

/**
 * Passport Configuration
 */

const strategy = new Auth0Strategy(
  {
    domain: envs["AUTH0_DOMAIN"],
    clientID: envs["AUTH0_CLIENT_ID"],
    clientSecret: envs["AUTH0_CLIENT_SECRET"],
    callbackURL: envs["AUTH0_CALLBACK_URL"]
  },
  function(accessToken, refreshToken, extraParams, profile, done) {
    return done(null, profile);
  }
);

/**
 *  App Configuration
 */

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, "public")));

app.use(expressSession(session));

passport.use(strategy);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

/**
 * Custom middleware
 */

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
});

/**
 * Router mouting
 */

app.use("/", authRouter);

/**
 * Routes Definitions
 */

const secured = (req, res, next) => {
  if (req.user) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect("/login");
};

app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.get("/user", secured, (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  res.render("user", {
    title: "Profile",
    userProfile: userProfile
  });
});

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});