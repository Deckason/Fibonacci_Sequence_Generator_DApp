// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

function hex2Object(hex) {
  const utf8String = ethers.toUtf8String(hex);
  return JSON.parse(utf8String);
}

function obj2Hex(obj) {
  const jsonString = JSON.stringify(obj);
  return ethers.hexlify(ethers.toUtf8Bytes(jsonString));
}

function fibonacci(n) {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function generateFibonacciSequence(terms) {
  const sequence = [];
  for (let i = 0; i < terms; i++) {
    sequence.push(fibonacci(i));
  }
  return sequence;
}

let users = [];
let total_operations = 0;

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  const metadata = data['metadata'];
  const sender = metadata['msg_sender'];
  const payload = data['payload'];

  let fibonacciInput = hex2Object(payload);

  if (!Number.isInteger(fibonacciInput.terms) || fibonacciInput.terms < 1) {
    const report_req = await fetch(rollup_server + "/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: obj2Hex("Invalid number of terms") }),
    });

    return "reject";
  }

  users.push(sender);
  total_operations += 1;

  const fibonacciSequence = generateFibonacciSequence(fibonacciInput.terms);

  const notice_req = await fetch(rollup_server + "/notice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: obj2Hex(fibonacciSequence) }),
  });

  return "accept";
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));

  const payload = data['payload'];
  const route = ethers.toUtf8String(payload);

  let responseObject = {};
  if (route === "list") {
    responseObject = JSON.stringify({ users });
  } else if (route === "total") {
    responseObject = JSON.stringify({ total_operations });
  } else {
    responseObject = "route not implemented";
  }

  const report_req = await fetch(rollup_server + "/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: obj2Hex(responseObject) }),
  });

  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();