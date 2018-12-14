# IBM Cloud App ID
Node Sample App for the IBM Cloud App ID service. You can either run the application locally or in IBM Cloud.

[![IBM Cloud powered][img-ibmcloud-powered]][url-ibmcloud]
[![Codacy][img-codacy]][url-codacy]
[![Version][img-version]][url-repo]
[![DownloadsMonthly][img-downloads-monthly]][url-repo]
[![DownloadsTotal][img-downloads-total]][url-repo]
[![License][img-license]][url-repo]

[![GithubWatch][img-github-watchers]][url-github-watchers]
[![GithubStars][img-github-stars]][url-github-stars]
[![GithubForks][img-github-forks]][url-github-forks]

## Table of Contents
* [Contents](#contents)
* [Requirements](#requirements)
* [Running Locally](#running-locally)
* [Running in IBM Cloud](#running-in-ibm-cloud)
* [Clarification](#clarification)
* [License](#license)

## Contents

`app.js`  Uses Express to set the routes and views.

`views/index.html`  The application landing page. Click **Login** to start.

`routes/protected`  After clicking the **Login** button, the user is redirected here. This is where
we check whether the user is authorized or not. In  the case where the user is not authorized, we send a request to the
authentication server to start the OAuth flow. If the user is authorized, we show the protected data.

`routes/token`  This page shows the access and id token payload.

### Requirements
* Node 6.0.0 or higher

## Running Locally

Run the following commands:
```bash
npm install
npm start
```
Use the link http://localhost:3000 to load the web application in browser.

## Running in IBM Cloud

### Prerequisites
Before you begin, make sure that IBM Cloud CLI is installed.
For more information visit: https://console.bluemix.net/docs/cli/reference/bluemix_cli/get_started.html#getting-started.

### Deployment

**Important:** Before going live, remove http://localhost:3000/* from the list of web redirect URLs located in "Identity Providers" -> "Manage" page in the AppID dashboard.

1. Login to IBM Cloud.

  `bx login https://api.{{domain}}`

2. Target a Cloud Foundry organization and space in which you have at least Developer role access:

  Use `bx target --cf` to target Cloud Foundry org/space interactively.

3. Bind the sample app to the instance of App ID:

  `bx resource service-alias-create "appIDInstanceName-alias" --instance-name "appIDInstanceName" -s {{space}}`

4. Deploy the sample application to IBM Cloud.

  `bx app push`

5. Open your IBM Cloud app route in the browser.

## Clarification
This sample runs on one instance and uses the session to store the authorization data.
In order to run it in production mode, use services such as Redis to store the relevant data.

## License

Copyright (c) 2018 IBM Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
