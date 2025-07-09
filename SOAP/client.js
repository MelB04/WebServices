const soap = require("soap");

soap.createClient(
  "http://localhost:8000/products?wsdl",
  {},
  function (err, client) {
    if (err) {
      console.error("Error creating SOAP client:", err);
      return;
    }

    client.CreateProduct(
      { name: "Ma valise", price: 1500, about: "Elle contient mes habits" },
      function (err, result) {
        if (err) {
          console.error(
            "Error making SOAP request:",
            err.response.status,
            err.response.statusText,
            err.body
          );
          return;
        }
        console.log("Result:", result);
      }
    );

    client.GetProducts({}, function (err, result) {
      if (err) {
        console.error(
          "Error making SOAP request:",
          err.response.status,
          err.response.statusText,
          err.body
        );
        return;
      }
      console.log("Result get :", result);
    });

    client.PatchProduct(
      {
        id: 3,
        name: "Ma valise HERMES",
        price: 1500,
        about: "elle contient mes habits",
      },
      function (err, result) {
        if (err) {
          console.error(
            "Error making SOAP request:",
            err.response.status,
            err.response.statusText,
            err.body
          );
          return;
        }
        console.log("Result update :", result);
      }
    );

    client.DeleteProduct(
      {
        id: 3,
      },
      function (err, result) {
        if (err) {
          console.error(
            "Error making SOAP request:",
            err.response.status,
            err.response.statusText,
            err.body
          );
          return;
        }
        console.log("Result delete :", result);
      }
    );
  }
);
