var express = require("express");
var bodyParser = require("body-parser");
// var path = require("path");
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer")
require("dotenv").config();
const { google } = require('googleapis');
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/Project');
var db = mongoose.connection;


db.on('error', console.error.bind(console, "connection error"));
db.once('open', function (callback) {
    console.log("connection succeeded");
})


var app = express();
app.use(express.static('public'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));


// Node mailer

let CLIENT_ID = process.env.CLIENT_ID;
let CLIENT_SECRET = process.env.CLIENT_SECRET;
let REFRESH_TOKEN = process.env.REFRESH_TOKEN;
let REDIRECT_URL = 'https://developers.google.com/oauthplayground'

const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URL
);

// Set the refresh token (generated after authenticating with OAuth2)
oAuth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
});

// Create a Nodemailer transporter using OAuth2
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: 'devanshns2607@gmail.com',
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: oAuth2Client.getAccessToken(),
    },
});

// End of Node mailer

// OTP 

function generateOTP(length) {
    const digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < length; i++) {
        OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
}

function verifyOTP(userOTP, generatedOTP) {
    return userOTP === generatedOTP;
}

// End of OTP 
var generatedOTP = generateOTP(6);
var sharedData = undefined;

app.post('/validateOTP', function (req, res) {
    const userEnteredOTP = req.body.OTP;

    // Verify the OTP
    const isValidOTP = verifyOTP(userEnteredOTP, generatedOTP);
    if (isValidOTP) {
        db.collection('signup').insertOne(sharedData, function (err, collection) {
            if (err) throw err;
            console.log("Record inserted Successfully");
        });
        return res.redirect("/login.html");
    } else {
        console.log('OTP is invalid.');
    }
})


app.post('/sign_up', sendGmail, function (req, res) {
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;

    var data = {
        "name": name,
        "email": email,
        "password": password,
    }
    sharedData = data;

});

function sendGmail(req, res, next) {
    var email = req.body.email;
    // async..await is not allowed in global scope, must use a wrapper
    async function main() {
        // send mail with defined transport object
        const info = await transporter.sendMail({
            from: {
                name: "Quiz Master",
                address: process.env.USER
            },
            to: `${email}`,
            subject: "Quiz Player Email Verification",
            text: "Please Check the OTP and Verify your email address.",
            html: `<b>${generatedOTP} is your OTP for Email Verification.</b>`,
        });

        console.log("Message sent: %s", info.messageId);
    }
    main().catch(console.error);
    next()
}

const posts = [
    {
        name: 'prem',
        post: 'post 1'
    },
    {
        name: 'gungun',
        post: 'post 2'
    }
]

app.get('/posts', authenticateToken, (req, res) => {
    res.json(posts.filter((post) => req.user.name == post.name));
})


app.post('/login', function (req, res) {
    var email = req.body.email;
    var password = req.body.password;
    // Check if login data matches signup data
    db.collection('signup').findOne({ "email": email, "password": password }, function (err, result) {
        if (err) throw err;
        if (result) {

            // JWT token for user
            const username = result.name;
            const user = { name: username }

            const accessToken = getAccessToken(user);
            const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET);
            refreshTokens.push(refreshToken);
            console.log(refreshTokens);

            res.json({ accessToken: accessToken, refreshToken: refreshToken });

        } else {
            // Alert user if login fails
            return res.send('<script>alert("Login Failed");</script>');
        }
    });
});

let refreshTokens = [];

app.post('/token', (req, res) => {
    const refreshToken = req.body.token;

    if (refreshToken == null) return res.sendStatus(401);

    if (!refreshTokens.includes(refreshToken)) return res.sendStatus(404);
        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            res.json(getAccessToken({"name":user.name}));
        });

})

app.delete('/logout',(req,res)=>{
    refreshTokens = refreshTokens.filter((token)=>token != req.body.token);
    res.sendStatus(204);

})

function getAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1m" });
}

// Token authentication function
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {

        if (err) return res.sendStatus(403);

        req.user = user;
        next();

    })
}

// Define schema for quiz
const scoreSchema = new mongoose.Schema({

    username: String,
    category: String,
    score: String

});

// Define model for quiz
const Score = mongoose.model('Score', scoreSchema);


app.post('/storeScore', authenticateToken, (req, res) => {

    const score = req.body.score;
    const username = req.user.name;
    const category = req.body.category;

    const userScore = new Score({
        username: username,
        category: category,
        score: score
    });
    console.log(userScore)
    // Save the new quiz document to the database
    userScore.save()
        .then((err, result) => {
            if (err) return res.sendStatus(400);
            res.sendStatus(200);
        })
})



// Set up multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.csv' || '.xlsx')) {
            cb(null, true);
        } else {
            console.log("in false file")
            cb(null, false);
        }
    },
});

// Define schema for quiz
const quizSchema = new mongoose.Schema({
    questions: [{
        question: String,
        options: Array,
        correctAnswer: String
    }]
});

// Define model for quiz
const Quiz = mongoose.model('Quiz', quizSchema);

module.exports=Quiz;
// Post API to generate quiz link
app.post('/generateLink', upload.single('csvFile'), function (req, res) {

    // Read data from Excel file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    // Accumulate questions into an array
    const questions = data.map(questionData => ({
        question: questionData.Question,
        options: [questionData["Option A"], questionData["Option B"], questionData["Option C"], questionData["Option D"]],
        correctAnswer: questionData["Correct Answer"]
    }));

    // Create a new document with all questions
    const newQuiz = new Quiz({
        questions: questions
    });

    // Save the new quiz document to the database
    newQuiz.save()
        .then((quiz) => {
            console.log('Quiz saved successfully:', quiz);
            res.redirect(`/quiz.html?category=questions`);
            db.collection('quizzes').findOne({}, function (err, result) {
                if (err) {
                    console.error('Error fetching document:', err);
                    return;
                }
                if (!result) {
                    console.error('Document not found');
                    return;
                }
                // Extract the questions array from the fetched document
                const questionsArray = result.questions;

                // Write the questions array to a JavaScript file
                fs.writeFile('public/src/questions.js', `const questions = ${JSON.stringify(questionsArray, null, 2)};`, 'utf8', function (err) {
                    if (err) {
                        console.error('Error writing to file:', err);
                        return;
                    }
                    console.log('Questions array written to questions.js file successfully');
                });
            });
        })
        .catch(error => {
            console.error('Error saving quiz:', error);
            res.status(500).send('Error saving quiz');
        });
});



app.listen(3000, function () {
    console.log("Server listening at port 3000");
});