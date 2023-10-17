require("dotenv").config();

const express = require("express");
const app = express();
const db = require("./models");
const { Users } = require("./models");

const amqp = require("amqplib");
const config = require('./config');

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const { createTokens, validateToken } = require("./JWT");

const bodyParser = require("body-parser");

let refreshTokens = [];

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json("application/json"));

const Producer = require("./producer");
const producer = new Producer();

app.post("/register", (req, res, next) => {
  const { username, password, isModerator, consent } = req.body;

  // Check if the user has given consent
  if (!consent) {
    res.status(400).json({ error: "Consent is required to register." });
    return;
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      res.status(400).json({ error: err });
    } else {
      Users.create({
        username: username,
        password: hash,
        isModerator: isModerator || false,
      })
        .then(async () => {
          // Publish a message to the exchange when a new user is registered
          await producer.publishMessage('Info', req.body.username);
          res.json(`By registering you agree to let us store your data. USER WITH USERNAME ${req.body.username} REGISTERED`);
        })
        .catch((err) => {
          if (err) {
            res.status(400).json({ error: err });
          }
        });
    }
  });
});


function generateAccessToken(username) {
  return jwt.sign({ username }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '300s' });
}

function authenticateToken(req, res, next) {

  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (token == null) {
      return res.sendStatus(401)
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
          return res.sendStatus(403)
      }
      req.user = user
      next()
  })
}

app.post('/token', (req, res) => {
  //store in database
  const refreshToken = req.body.token;
  if (refreshToken == null) {
      return res.sendStatus(401)
  }
  if (!refreshTokens.includes(refreshToken)) {
      return res.sendStatus(403)
  }
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
      if (err) {
          return res.sendStatus(403)
      }
      const accessToken = generateAccessToken({ username: user.username })
      res.json({ accessToken: accessToken })
  })
})

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await Users.findOne({ where: { username: username } });

  if (!user) res.status(400).json({ error: "User Doesn't Exist" });

  const dbPassword = user.password;
  bcrypt.compare(password, dbPassword).then((match) => {
    if (!match) {
      res
        .status(400)
        .json({ error: "Wrong Username and Password Combination!" });
    } else {
      const accessToken = generateAccessToken(username);
      const refreshToken = jwt.sign({username}, process.env.REFRESH_TOKEN_SECRET);

      refreshTokens.push(refreshToken);

      res.json({ accessToken: accessToken, refreshToken: refreshToken })
    }
  });
});

app.post("/logout", authenticateToken, async (req, res) => {
  const user = await Users.findByPk(req.user.id);

  refreshTokens = refreshTokens.filter(token => token !== req.body.token)

  res.json("LOGGED OUT OF " + user.username);
});

app.get("/profile", authenticateToken, async (req, res) => {
  const user = await Users.findByPk(req.user.id);
  res.json(user);
});

app.delete("/delete", authenticateToken, async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id);
    if (!user) {
      throw new Error("User not found");
    }

    await user.destroy();

    // Publish a message to the exchange when a user is deleted
    await producer.publishMessage('UserDeleted', user.username);

    res.json({ message: "User deleted successfully: " + user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/users", authenticateToken, (req, res) => {
  if (req.user && req.user.isModerator) { // Check if req.user exists and has the isModerator property
    Users.findAll()
      .then((users) => {
        res.json(users);
      })
      .catch((err) => {
        res.status(500).json({ error: "Failed to fetch users" });
      });
  } else {
    res.status(403).json({ error: "Unauthorized" });
  }
});


db.sequelize.sync().then(() => {
  app.listen(3001, () => {
    console.log("SERVER RUNNING ON PORT 3001");
  });
});