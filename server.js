const { hostname } = require('os');
const http = require('http');
const url = require('url');
const message = 'Hello World\n';
const port = 8080;

const querystring = require('querystring');

var AWS = require('aws-sdk');

AWS.config.update({region: 'eu-west-1'});

var dynamodb = new AWS.DynamoDB();
//var dynamodb = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});


const util = require('util');
const safePromisify = function (fun, methodsArray) {
  const suffix = 'Async';
    methodsArray.forEach(method => {
      fun[method + suffix] = util.promisify(fun[method]);
  });
}
safePromisify(dynamodb, ['getItem', 'putItem', 'updateItem', 'deleteItem']);


function darnation(res, text) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  if (typeof text === 'undefined') {
    res.end('Fail. Darnation!');
  }
  else {
    res.end(text);
  }
}


function getQuoteCountPromise() {
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    }
  };
  return dynamodb.getItemAsync(params);
}


function incQuoteCountPromise(counterCurrValue)
{
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    },
    ExpressionAttributeNames: {
      '#V': 'Value'
    },
    ExpressionAttributeValues: {
      ':nv': {N: (counterCurrValue+1).toString()},
      ':cv': {N: (counterCurrValue).toString()}
    },
    ConditionExpression: '#V = :cv',
    UpdateExpression: 'SET #V = :nv',
    ReturnValues: 'UPDATED_OLD'
  };
  return dynamodb.updateItemAsync(params);
}


function decQuoteCountPromise(counterCurrValue)
{
  const params = {
    TableName: 'Counters',
    Key: {
      'Name' : {S: 'Quotes'}
    },
    ExpressionAttributeNames: {
      '#V': 'Value'
    },
    ExpressionAttributeValues: {
      ':nv': {N: (counterCurrValue-1).toString()},
      ':cv': {N: (counterCurrValue).toString()}
    },
    ConditionExpression: '#V = :cv',
    UpdateExpression: 'SET #V = :nv',
    ReturnValues: 'UPDATED_NEW'
  };
  return dynamodb.updateItemAsync(params);
}


function getQuoteNrPromise(getIdx) {
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: getIdx.toString()}
    }
  };
  return dynamodb.getItemAsync(params);
}


function deleteQuoteNrPromise(deleteIdx) {
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: deleteIdx.toString()}
    },
    ReturnValues: 'ALL_OLD'
  };
  console.log('DELETE', params);
  return dynamodb.deleteItemAsync(params);
}


function getRandomQuote(res) {
  getQuoteCountPromise()
  .then((result) => {
    // console.log('getRandomQuote THEN1', result);
    try {
      const itemCount = parseInt(result.Item.Value.N);
      if (itemCount < 1) {
        darnation(res, 'Database empty');
        return;
      }
      return getQuoteNrPromise(Math.floor(Math.random() * itemCount));
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Counters', err);
    darnation(res);
  })
  .then((result) => {
    try {
      // console.log('getRandomQuote THEN2', result);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"response_type":"in_channel","text":"' + result.Item.Quote.S.split('"').join('\\"') + '"}');
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Quotse', err);
    darnation(res);
  });
}


function scanQuotes(keyword, res) {
  const params = {
    TableName: 'Quotse',
    FilterExpression: 'contains (ScanText, :keyword)',
    ProjectionExpression: 'Quote',
    ExpressionAttributeValues: {':keyword': {'S': keyword.toLowerCase()}}
  };

  dynamodb.scan(params, function(err, result) {
    if (err) {
      console.log('QUERY Error', err);
    } else {
      console.log('QUERY Success', result);
      console.log('got items:', result.Items.length);
      
      if (result.Items.length < 1) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end('{"response_type":"in_channel","text":"No match :("}');
        return;
      }

      const itemNr = Math.floor(Math.random() * result.Items.length);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"response_type":"in_channel","text":"' + result.Items[itemNr].Quote.S.split('"').join('\\"') + '"}');
      console.log(result.Items[itemNr]);
    }
  });
}


function addQuote(line, res) {
  getQuoteCountPromise()
  .then((result) => {
    // console.log('getRandomQuote THEN1', result);
    try {
      const itemCount = parseInt(result.Item.Value.N);
      return incQuoteCountPromise(itemCount);
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Counter', err);
    darnation(res);
  })
  .then((result) => {
    console.log('incRandomQuote THEN1', result);
    const params = {
      TableName: 'Quotse',
      Item: {
        'Idx': {N: result.Attributes.Value.N},
        'Quote': {S: line},
        'ScanText': {S: line.toLowerCase()}
      }
    };

    return dynamodb.putItemAsync(params);
  }, (err) => {
    console.error('INC Counter', err);
    darnation(res);
  })
  .then((result) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"response_type":"in_channel","text":"It is done"}');
  }, (err) => {
    console.error('PUT new', err);
    darnation(res);
  });
}


function deleteLastQuote(res)
{
  getQuoteCountPromise()
  .then((result) => {
    // console.log('deleteLastQuote THEN', result);
    try {
      const itemCount = parseInt(result.Item.Value.N);
      if (itemCount < 1) {
        darnation(res, 'Database empty');
        return;
      }
      return decQuoteCountPromise(itemCount);
    }
    catch (err) {
      console.error(err);
      darnation(res);
    }
  }, (err) => {
    console.error('GET Counter', err);
    darnation(res);
  })
  .then((result) => {
    // console.log('DEC THEN', result);
    try {
      const itemIdx = parseInt(result.Attributes.Value.N);
      return deleteQuoteNrPromise(itemIdx);
    } catch (err) {
      console.error('DELETE THEN', err);
    }
  }, (err) => {
    console.error('DEC Counter', err);
    darnation(res);
  })
  .then((result) => {
    // console.log('DELETE Quote', result);
    try {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Quote removed: ' + result.Attributes.Quote.S.split('"').join('\\"'));
    } catch (err) {
      console.error('DELETE Quote', err);
    }
  }, (err) => {
    console.error('DELETE Quote', err);
  });
}


function pushQuotes(res) {
  try {
    var fs = require('fs');
    const allLines = fs.readFileSync('quotes.txt', 'utf8');
    const lines = allLines.split('\n');
    var addedLines = 0;
    lines.forEach(function(line) {
      if (line.length > 1) {
        const params = {
          TableName: 'Quotse',
          Item: {
            'Idx': {N: addedLines.toString()},
            'Quote': {S: line},
            'ScanText': {S: line.toLowerCase()}
          }
        };

        dynamodb.putItem(params, function(err, data) {
          if (err) {
            console.error('Quotse write error', err);
          }
        });

        addedLines += 1;
      }
    });

    const params = {
      TableName: 'Counters',
      Key: {
        'Name' : {S: 'Quotes'}
      },
      ExpressionAttributeNames: {
        '#V': 'Value'
      },
      ExpressionAttributeValues: {
        ':v': {N: addedLines.toString()}
      },
      UpdateExpression: 'SET #V = :v'
    };

    dynamodb.updateItem(params, function(err, data) {
      if (err) {
        console.error('Counters write error', err);
      }
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(addedLines.toString() + ' lines added');
  }
  catch (err) {
    console.error(err);
    darnation(res);
  }
}


// function pullQuoteNrPromise(getIdx) {
//   const params = {
//     TableName: 'Quotse',
//     Key: {
//       'Idx': {N: getIdx.toString()}
//     }
//   };
//   return dynamodb.getItemAsync(params);
// }

function pullQuoteNrPromise(res, fileHandle, getIdx) {
  const params = {
    TableName: 'Quotse',
    Key: {
      'Idx': {N: getIdx.toString()}
    }
  };
  return new Promise((resolve, reject) => {
    dynamodb.getItemAsync(params).then(function(result) {
      resolve({'http': res, 'db': result, 'idx': getIdx, 'fh': fileHandle});
    }).catch(function (err) {
      reject(err);
    });
  });
}


function writePulledQuote(result) {
  var fileHandle = result.fh;
  if (Object.keys(result.db).length == 0) {
    console.log('Pulled', result.idx, 'quotes');
    fileHandle.end();
    res = result.http;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(result.idx.toString() + ' lines pulled to quotes_pulled.txt');
    return null;
  }
  
  // console.log(result);
  fileHandle.write(result.db.Item.Quote.S + '\n');
  const quoteIdx = parseInt(result.db.Item.Idx.N);
  // console.log(quoteIdx, result.db.Item.Quote.S);
  return pullQuoteNrPromise(result.http, result.fh, quoteIdx+1).then(writePulledQuote);
};


function pullQuotes(res) {
  // const pqueue = require('p-queue');
  // const queue = new PQueue({concurrency: 1});
  var pulled = 0;

  try {
    var fs = require('fs');
    var fileHandle = fs.createWriteStream('quotes_pulled.txt', {flags: 'w'});

    getQuoteCountPromise().then((result) => {
      console.log('pull CNT', result);
      const quoteCnt = result.Item.Value.N;
      if (quoteCnt > 0) {
        pullQuoteNrPromise(res, fileHandle, 0).then(writePulledQuote);
      }
    }, (err) => {
      console.error('pullQuotes ERROR', err);
      darnation(res);
    });
  }
  catch (err) {
    console.error('pull CONV ERROR', err);
    darnation(res);
    return;
  }


  return;



  try {
    // var fs = require('fs');
    // const allLines = fs.writeFile('quotes_pulled.txt', 'utf8');

    const params = {
      TableName: 'Quotse',
      KeyConditionExpression: 'Idx BETWEEN :from AND :to',
      // ExpressionAttributeNames: {
      //   '#idx': 'Idx'
      // },
      ExpressionAttributeValues: {
        ':from': {N: '0'},
        ':to': {N: '99'}
      }
    };

    dynamodb.query(params, function (err, data) {
      if (err) {
        console.error(err);
      }
      else {
        console.log(data);
      }
    });
  }
  catch (err) {
    console.error(err);
    darnation(res);
  }
}


function adminAction(text, res) {
  console.log('adminAction', text);

  const parts = text.split(' ');
  if (parts.length < 2) {
    console.log('adminAction parts.length =', parts.length.toString());
    darnation(res, 'Parameters missing');
    return;
  }

  if (parts[0] != '2T0uVdwJTd2hSSx9oa') {
    console.log('adminAction bad pass');
    darnation(res, 'Bad param');
    return;
  }

  if (parts[1] == 'pushQuotes') {
    pushQuotes(res);
  }
  else if (parts[1] == 'pullQuotes') {
    pullQuotes(res);
  }
  else if (parts[1] == 'deleteLast') {
    deleteLastQuote(res);
  }
  else {
    console.log('adminAction unk cmd');
    darnation(res, 'Bad param');
  }
}


const server = http.createServer((req, res) => {
  // console.log(`Got ${req} ` + req.url + ' ')
  // for (var prop in req.headers) {
  //   if (req.headers.hasOwnProperty(prop)) { console.log(prop + ': ' + req.headers[prop]) }
  // }

  if (!req.headers.hasOwnProperty('user-agent')  ||  !req.headers['user-agent'].includes('Slackbot')  ||  !req.headers.hasOwnProperty('x-slack-signature')) {
    console.log('Request headers invalid');
    darnation(res, 'Pffffff....');
    return;
  }


  let rawData = '';
  req.on('data', (chunk) => { rawData += chunk; });
  req.on('end', () => {
    try {
      const parsedData = querystring.parse(rawData);
      const action = querystring.parse(url.parse(req.url)['query'])['action'];
      const text = parsedData['text'];
      console.log('ACTION', action);
      console.log('TEXT', text);

      if (action == 'getrandom') {
        if (text.length < 1) {
          getRandomQuote(res);
        }
        else {
          scanQuotes(text, res);
        }
      }
      else if (action == 'add') {
        addQuote(text, res);
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
