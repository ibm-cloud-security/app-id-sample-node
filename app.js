/*
 Copyright 2017 IBM Corp.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const nconf = require("nconf");
const appID = require("ibmcloud-appid");


const helmet = require("helmet");
const express_enforces_ssl = require("express-enforces-ssl");
const cfEnv = require("cfenv");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");

const WebAppStrategy = appID.WebAppStrategy;
const userProfileManager = appID.UserProfileManager;
const UnauthorizedException = appID.UnauthorizedException;

const app = express();

const GUEST_USER_HINT = "A guest user started using the app. App ID created a new anonymous profile, where the user’s selections can be stored.";
const RETURNING_USER_HINT = "An identified user returned to the app with the same identity. The app accesses his identified profile and the previous selections that he made.";
const NEW_USER_HINT = "An identified user logged in for the first time. Now when he logs in with the same credentials from any device or web client, the app will show his same profile and selections.";

const LOGIN_URL = "/ibm/bluemix/appid/login";
const LOGIN_URL2 = "/ibm/bluemix/appid/login2";

const CALLBACK_URL = "/ibm/bluemix/appid/callback";
const CALLBACK_URL2 = "/ibm/bluemix/appid/callback2";

const port = process.env.PORT || 3000;

const isLocal = cfEnv.getAppEnv().isLocal;

const config = getLocalConfig();
const config2 = getLocalConfig2();
configureSecurity();

app.use(flash());

// Setup express application to use express-session middleware
// Must be configured with proper session storage for production
// environments. See https://github.com/expressjs/session for
// additional documentation
app.use(session({
  secret: "123456",
  resave: true,
  saveUninitialized: true,
	proxy: true,
	cookie: {
		httpOnly: true,
		secure: !isLocal
	}
}));

app.set('view engine', 'ejs');

// Configure express application to use passportjs
app.use(passport.initialize());
app.use(passport.session());

let webAppStrategy = new WebAppStrategy(config);
passport.use('appid1', webAppStrategy);

let webAppStrategy2 = new WebAppStrategy(config2);
passport.use('appid2', webAppStrategy2);

// Initialize the user attribute Manager
userProfileManager.init(config);



// Configure passportjs with user serialization/deserialization. This is required
// for authenticated session persistence accross HTTP requests. See passportjs docs
// for additional information http://passportjs.org/docs
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});

// Explicit login endpoint. Will always redirect browser to login widget due to {forceLogin: true}.
// If forceLogin is set to false redirect to login widget will not occur of already authenticated users.
app.get(LOGIN_URL, passport.authenticate('appid1', {
  forceLogin: true
}));

app.get(LOGIN_URL2, passport.authenticate('appid2', {
	forceLogin: true
}));

// Callback to finish the authorization process. Will retrieve access and identity tokens/
// from AppID service and redirect to either (in below order)
// 1. the original URL of the request that triggered authentication, as persisted in HTTP session under WebAppStrategy.ORIGINAL_URL key.
// 2. successRedirect as specified in passport.authenticate(name, {successRedirect: "...."}) invocation
// 3. application root ("/")
app.get(CALLBACK_URL, passport.authenticate('appid1', {failureRedirect: '/error' ,failureFlash: true ,allowAnonymousLogin: true}));
app.get(CALLBACK_URL2, passport.authenticate('appid2', {failureRedirect: '/error' ,failureFlash: true ,allowAnonymousLogin: true}));

function storeRefreshTokenInCookie(req, res, next) {
	if (req.session[WebAppStrategy.AUTH_CONTEXT] && req.session[WebAppStrategy.AUTH_CONTEXT].refreshToken) {
		const refreshToken = req.session[WebAppStrategy.AUTH_CONTEXT].refreshToken;
		/* An example of storing user's refresh-token in a cookie with expiration of a month */
		res.cookie('refreshToken', refreshToken, {maxAge: 1000 * 60 * 60 * 24 * 30 /* 30 days */});
	}
	next();
}

function isLoggedIn(req) {
	return req.session[WebAppStrategy.AUTH_CONTEXT];
}

// Protected area. If current user is not authenticated - redirect to the login widget will be returned.
// In case user is authenticated - a page with current user information will be returned.
app.get("/protected", function tryToRefreshTokensIfNotLoggedIn(req, res, next) {
	if (isLoggedIn(req)) {
		return next();
	}

	webAppStrategy.refreshTokens(req, req.cookies.refreshToken).finally(function() {
		next();
	});
}, passport.authenticate('appid1'), storeRefreshTokenInCookie, function (req, res, next) {
	var accessToken = req.session[WebAppStrategy.AUTH_CONTEXT].accessToken;
	var isGuest = req.user.amr[0] === "appid_anon";
	var isCD = req.user.amr[0] === "cloud_directory";
	var foodSelection;
	var firstLogin;
	// get the attributes for the current user:
	userProfileManager.getAllAttributes(accessToken).then(function (attributes) {
		var toggledItem = req.query.foodItem;
		foodSelection = attributes.foodSelection ? JSON.parse(attributes.foodSelection) : [];
		firstLogin = !isGuest && !attributes.points;
		if (!toggledItem) {
			return;
		}
		var selectedItemIndex = foodSelection.indexOf(toggledItem);
		if (selectedItemIndex >= 0) {
			foodSelection.splice(selectedItemIndex, 1);
		} else {
			foodSelection.push(toggledItem);
		}
		// update the user's selection
		return userProfileManager.setAttribute(accessToken, "foodSelection", JSON.stringify(foodSelection));
	}).then(function () {
		givePointsAndRenderPage(req, res, foodSelection, isGuest, isCD, firstLogin);
	}).catch(function (e) {
		next(e);
	});
});

// Protected area. If current user is not authenticated - an anonymous login process will trigger.
// In case user is authenticated - a page with current user information will be returned.
app.get("/anon_login", passport.authenticate('appid1', {allowAnonymousLogin: true, successRedirect : '/protected', forceLogin: true}));

// Protected area. If current user is not authenticated - redirect to the login widget will be returned.
// In case user is authenticated - a page with current user information will be returned.
app.get("/login", passport.authenticate('appid1', {successRedirect : '/protected', forceLogin: true}));

app.get("/login2", passport.authenticate('appid2', {successRedirect : '/protected', forceLogin: true}));

app.get("/logout", function(req, res, next) {
	WebAppStrategy.logout(req);
	// If you chose to store your refresh-token, don't forgot to clear it also in logout:
	res.clearCookie("refreshToken");
	res.redirect("/");
});


app.get("/token", function(req, res){
	//return the token data'ee'
	res.render('token',{tokens: JSON.stringify(req.session[WebAppStrategy.AUTH_CONTEXT])});
});

app.get("/userInfo", passport.authenticate('appid1'), function(req, res) {
	//return the user info data
	userProfileManager.getUserInfo(req.session[WebAppStrategy.AUTH_CONTEXT].accessToken).then(function (userInfo) {
		res.render('userInfo', {userInfo: JSON.stringify(userInfo)});
	}).catch(function() {
        res.render('infoError');
    })
});

app.get('/error', function(req, res) {
	let errorArray = req.flash('error');
	res.render("error.ejs",{errorMessage: errorArray[0]});
});

app.get("/change_password", passport.authenticate('appid1', {
    successRedirect: '/protected',
    show: WebAppStrategy.CHANGE_PASSWORD
}));

app.get("/change_details", passport.authenticate('appid1', {
    successRedirect: '/protected',
    show: WebAppStrategy.CHANGE_DETAILS
}));


app.use(express.static("public", {index: null}));

app.use('/', function(req, res, next) {
	if (!isLoggedIn(req)) {
		webAppStrategy.refreshTokens(req, req.cookies.refreshToken).then(function() {
			res.redirect('/protected');
		}).catch(function() {
			next();
		})
	} else {
		res.redirect('/protected');
	}
}, function(req,res,next) {
	res.sendFile(__dirname + '/public/index.html');
});

app.use(function(err, req, res, next) {
	if (err instanceof UnauthorizedException) {
		WebAppStrategy.logout(req);
		res.redirect('/');
	} else {
		next(err);
	}
});

app.listen(port, function(){
  console.log("Listening on http://localhost:" + port);
});

function givePointsAndRenderPage(req, res, foodSelection, isGuest, isCD, firstLogin) {
	//return the protected page with user info
	var hintText;
	if (isGuest) {
		hintText = GUEST_USER_HINT;
	} else {
		if (firstLogin) {
			hintText = NEW_USER_HINT;
		} else {
			hintText = RETURNING_USER_HINT;
		}
	}
	var email = req.user.email;
	if(req.user.email !== undefined && req.user.email.indexOf('@') != -1)
		email = req.user.email.substr(0,req.user.email.indexOf('@'));
	var renderOptions = {
		name: req.user.name || email || "Guest",
		picture: req.user.picture || "/images/anonymous.svg",
		foodSelection: JSON.stringify(foodSelection),
		topHintText: isGuest ? "Login to get a gift >" : "You got 150 points go get a pizza",
		topImageVisible : isGuest ? "hidden" : "visible",
		topHintClickAction : isGuest ? ' window.location.href = "/login";' : ";",
		hintText,
		isGuest,
		isCD
	};

	if (firstLogin) {
		userProfileManager.setAttribute(req.session[WebAppStrategy.AUTH_CONTEXT].accessToken, "points", "150").then(function (attributes) {
			res.render('protected', renderOptions);
		});
	} else {
		res.render('protected', renderOptions);
	}
}

function getLocalConfig() {
	if (!isLocal) {
		return {};
	}
	let config = {};
	const localConfig = nconf.env().file(`${__dirname}/localdev-config.json`).get();
	const requiredParams = ['clientId', 'secret', 'tenantId', 'oauthServerUrl', 'profilesUrl'];
	requiredParams.forEach(function (requiredParam) {
		if (!localConfig[requiredParam]) {
			console.error('When running locally, make sure to create a file *localdev-config.json* in the root directory. See config.template.json for an example of a configuration file.');
			console.error(`Required parameter is missing: ${requiredParam}`);
			process.exit(1);
		}
		config[requiredParam] = localConfig[requiredParam];
	});

	if (localConfig.version) {
		config.version = localConfig.version;
	}

	if (localConfig.appidServiceEndpoint) {
		config.appidServiceEndpoint = localConfig.appidServiceEndpoint;
	}

	config['redirectUri'] = `http://localhost:${port}${CALLBACK_URL}`;
	return config;
}

function getLocalConfig2() {
	if (!isLocal) {
		return {};
	}
	let config = {};
	const localConfig = nconf.env().file(`${__dirname}/localdev-config2.json`).get();
	const requiredParams = ['clientId', 'secret', 'tenantId', 'oauthServerUrl', 'profilesUrl'];
	requiredParams.forEach(function (requiredParam) {
		if (!localConfig[requiredParam]) {
			console.error('When running locally, make sure to create a file *localdev-config.json* in the root directory. See config.template.json for an example of a configuration file.');
			console.error(`Required parameter is missing: ${requiredParam}`);
			process.exit(1);
		}
		config[requiredParam] = localConfig[requiredParam];
	});

	if (localConfig.version) {
		config.version = localConfig.version;
	}

	if (localConfig.appidServiceEndpoint) {
		config.appidServiceEndpoint = localConfig.appidServiceEndpoint;
	}

	config['redirectUri'] = `http://localhost:${port}${CALLBACK_URL2}`;
	return config;
}

function configureSecurity() {
	app.use(helmet());
	app.use(cookieParser());
	app.use(helmet.noCache());
	app.enable("trust proxy");
	if (!isLocal) {
		app.use(express_enforces_ssl());
	}
}
