const { hostname } = require('os');
const http = require('http');
const url = require('url');
const message = 'Hello World\n';
const port = 8080;

const querystring = require('querystring');

var AWS = require('aws-sdk');

AWS.config.update({region: "eu-west-1"});

var dynamodb = new AWS.DynamoDB();
//var dynamodb = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});


function getQuoteCount(resultsFunc, res) {
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    }
  };

  dynamodb.getItem(params, function(err, data) {
    if (err) {
      console.error('getQuoteCount ', err);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Fail. Darnation!');
    }
    else {
      console.log('GETCNTR ', data);
      if (resultsFunc) {
        resultsFunc(data.Item.Value.N, res);
      }
    }
  });
}


function getQuoteNr(itemCount, res) {
  console.log('itemCount', itemCount)

  if (itemCount < 1) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Database empty');
    return;
  }

  const getIdx = Math.floor(Math.random() * itemCount);
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: getIdx.toString()}
    }
  };

  dynamodb.getItem(params, function(err, data) {
    if (err) {
      console.error('getQuoteNr(', getIdx, '/', itemCount, ') error: ', err);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Fail. Darnation!');
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"response_type":"in_channel","text":"' + data.Item.Text.S.split('"').join('\\"') + '"}');
    }
  });
}


function queryQuote(keyword, res) {
    const params = {
      TableName: 'Quotse',
      KeyConditionExpression: "#id = :idnum",
      ExpressionAttributeNames:{"#id": "Idx"},
      ExpressionAttributeValues: {":idnum": {'N': getIdx.toString()}}
    }
    console.log('QUERY', params)

    dynamodb.query(params, function(err, data) {
      if (err) {
        console.log("Error", err)
      } else {
        console.log("Success", data.Items)
        console.log(data)
        data.Items.forEach(function(element, index, array) {
          console.log(element.Idx.S + " (" + element.title.S + ")")
        });
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"response_type":"in_channel","text":"You say: WTF ' + text + '"}');
}


function pushQuotes(res) {
  try {
    var fs = require('fs');
    const allLines = fs.readFileSync('qsuotes.txt', 'utf8');
    const lines = allLines.split('\n');
    var addedLines = 0;
    lines.forEach(function(line) {
      if (line.length > 1) {
        const params = {
          TableName: 'Quotse',
          Item: {
            'Idx': {N: addedLines.toString()},
            'Text': {S: line}
          }
        };

        dynamodb.putItem(params, function(err, data) {
          if (err) {
            console.error('Write error', err);
          }
        });

        addedLines += 1;
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(addedLines.toString() + ' lines added');
  }
  catch (err) {
    console.error(err);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Pffffff....');
  }
}


function adminAction(text, res) {
  console.log('adminAction', text);

  const parts = text.split(' ');
  if (parts.length < 2) {
    console.log('adminAction parts.length =', parts.length.toString());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Parameters missing');
    return;
  }

  if (parts[0] != '2T0uVdwJTd2hSSx9oa') {
    console.log('adminAction bad pass');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Bad param');
    return;
  }

  if (parts[1] == 'pushQuotes') {
    pushQuotes(res);
  }
  else {
    console.log('adminAction unk cmd');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Bad param');
  }
}


const server = http.createServer((req, res) => {
  // console.log(`Got ${req} ` + req.url + ' ')
  // for (var prop in req.headers) {
  //   if (req.headers.hasOwnProperty(prop)) { console.log(prop + ': ' + req.headers[prop]) }
  // }

  if (!req.headers.hasOwnProperty('user-agent')  ||  !req.headers['user-agent'].includes('Slackbot')  ||  !req.headers.hasOwnProperty('x-slack-signature')) {
    console.log('Request headers invalid');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Pffffff....');
    return;
  }


  let rawData = '';
  req.on('data', (chunk) => { rawData += chunk; });
  req.on('end', () => {
    try {
      const parsedData = querystring.parse(rawData);
      const action = querystring.parse(url.parse(req.url)['query'])['action'];
      const text = parsedData['text'];
      console.log('ACTION ', action);
      console.log('TEXT', text);
      var itemCount = 0;

      if (text == 'get') {
      }

      if (action == 'getrandom') {
        getQuoteCount(getQuoteNr, res);
      }
      if (action == 'add') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Not implemented yet');
      }
      else if (action == 'admin') {
        adminAction(text, res);
      }
    }
    catch (e) {
      console.error(e.message);
    }
  });

//  console.log('QUERY ');
//  console.log(require('querystring').parse(req.data));
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname()}:${port}/`);
});
