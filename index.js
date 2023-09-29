// index.js

/**
 * Required External Modules
 */

const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const path = require("path");
const _ = require("lodash");
const dotenv = require("dotenv");
const expressSession = require("express-session");
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");
const result = dotenv.config();
const bodyParser = require("body-parser");

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

const client = new MongoClient(envs["DATABASE_URI"]);
const dbName = "proj1-backend";
const tournamentCollection = "tournaments";
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
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

app.use(expressSession(session));

passport.use(strategy);
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

/**
 * Custom middleware
 */

async function getAllTournaments() {
  try {
    let database = client.db(dbName);
    let collection = database.collection(tournamentCollection);

    const resultsCursor = await collection.find();
    //order results so newest is first
    resultsCursor.sort({ _id: -1 });
    const resultsArray = await resultsCursor.toArray();
    return resultsArray;
  }
  catch (err) {
    console.log(err);
  }
};

async function createNewTournament(dbObject) {
  try {
    let database = client.db(dbName);
    let collection = database.collection(tournamentCollection);

    const result = await collection.insertOne(dbObject);
    return result;
  }
  catch (err) {
    console.log(err);
  }
}

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

app.get("/user", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let tournaments = await getAllTournaments();
  res.render("user", {
    title: "Profile",
    userProfile: userProfile,
    tournaments: tournaments
  });
});

//this is an api endpoint that data gets posted to
//we need to store the data as json and then send to db
//we also need to add the user id to the data
app.post("/api/addTourney", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  //create object to store in db
  let submittedData = req.body;
  let dbData = {};
  dbData["owner"] = userProfile.nickname;
  dbData["name"] = submittedData["tourneyName"];
  dbData["date"] = submittedData["tourneyDate"];
  dbData["game"] = submittedData["tourneyGame"];
  dbData["location"] = submittedData["tourneyLocation"];
  dbData["image_url"] = submittedData["tourneyImage"];
  dbData["attendees"] = [];
  dbData["data"] = "";
  let result = await createNewTournament(dbData);
  res.redirect("/user");
});

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});