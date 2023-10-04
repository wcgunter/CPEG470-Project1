// index.js

/**
 * Required External Modules
 */

const { MongoClient, ServerApiVersion } = require("mongodb");
var mongodb = require("mongodb");
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
    console.log(resultsArray[0]);
    return resultsArray;
  }
  catch (err) {
    console.log(err);
  }
};

async function getTournamentById(id) {
  try {
    let database = client.db(dbName);
    let collection = database.collection(tournamentCollection);
    const query = { _id: new mongodb.ObjectId(id)};

    const result = await collection.findOne(query);
    return result;
  }
  catch (err) {
    console.log(err);
  }
}

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

app.get("/tournament/:id", secured, async (req, res, next) => {
  const {_raw, _json, ...userProfile} = req.user;
  let id = req.params.id;
  console.log("Tournament ID: " + id);
  let tournament = await getTournamentById(id);
  if (tournament == null) {
    res.render("404", {
      title: "404"
    });
  } else if (tournament.owner == userProfile.nickname) {
    res.render("tournament_admin", {
      title: "Tournament Admin",
      userProfile: userProfile,
      tournament: tournament
    });
  } else {
    res.render("tournament", {
      title: "Tournament",
      userProfile: userProfile,
      tournament: tournament
    });
  }
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
  //example data object
  let exampleData = {};
  exampleData["teams"] = [["Team 1", "Team 2"], ["Team 3", "Team 4"]];
  exampleData["results"] = [[[1,2],[3,4]]];
  dbData["data"] = exampleData;
  let result = await createNewTournament(dbData);
  res.redirect("/user");
});

app.post("/api/editTourney/:id", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let id = req.params.id;
  let submittedData = req.body;
  let tournament = await getTournamentById(id);
  let updatedParticipants = [];
  //the list of participants are stored as key value pairs (after tournamentImage, it is stored like "bob": "bob")
  //we need to get the keys and store them in an array
  for (let key in submittedData) {
    if (key != "tourneyName" && key != "tourneyDate" && key != "tourneyGame" && key != "tourneyLocation" && key != "tourneyImage") {
      updatedParticipants.push(key);
    }
  }
  if (tournament.owner == userProfile.nickname) {
    let database = client.db(dbName);
    let collection = database.collection(tournamentCollection);
    const query = { _id: new mongodb.ObjectId(id)};
    const update = { $set: { name: submittedData["tourneyName"], date: submittedData["tourneyDate"], game: submittedData["tourneyGame"], location: submittedData["tourneyLocation"], image_url: submittedData["tourneyImage"], attendees: updatedParticipants } };
    const options = { upsert: true };
    const result = await collection.updateOne(query, update, options);
  }
  res.redirect("/tournament/" + id);
});

app.get("/api/signup/:id", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let id = req.params.id;
  let tournament = await getTournamentById(id);
  let attendees = tournament.attendees;
  attendees.push(userProfile.nickname);
  let database = client.db(dbName);
  let collection = database.collection(tournamentCollection);
  const query = { _id: new mongodb.ObjectId(id)};
  const update = { $set: { attendees: attendees } };
  const options = { upsert: true };
  const result = await collection.updateOne(query, update, options);
  res.redirect("/tournament/" + id);
});

app.get("/api/cancel/:id", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let id = req.params.id;
  let tournament = await getTournamentById(id);
  let attendees = tournament.attendees;
  let index = attendees.indexOf(userProfile.nickname);
  if (index > -1) {
    attendees.splice(index, 1);
  }
  let database = client.db(dbName);
  let collection = database.collection(tournamentCollection);
  const query = { _id: new mongodb.ObjectId(id)};
  const update = { $set: { attendees: attendees } };
  const options = { upsert: true };
  const result = await collection.updateOne(query, update, options);
  res.redirect("/tournament/" + id);
});

app.post("/api/saveBracket/:id", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let id = req.params.id;
  let submittedData = req.body;
  let tournament = await getTournamentById(id);
  if (tournament.owner == userProfile.nickname) {
    let database = client.db(dbName);
    let collection = database.collection(tournamentCollection);
    const query = { _id: new mongodb.ObjectId(id)};
    const update = { $set: { data: submittedData } };
    const options = { upsert: true };
    const result = await collection.updateOne(query, update, options);
  }
  res.sendStatus(200);
});

app.get("/api/getAttendees/:id", secured, async (req, res, next) => {
  const { _raw, _json, ...userProfile } = req.user;
  let id = req.params.id;
  let tournament = await getTournamentById(id);
  let attendees = tournament.attendees;
  res.json(attendees);
});

//404 page handler
app.get("*", (req, res) => {
  res.render("404", {
    title: "404"
  });
});

/**
 * Server Activation
 */

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});