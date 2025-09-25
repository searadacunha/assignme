exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: false,
      message: 'France Travail temporairement desactive - test syntaxe OK',
      fallback: true
    })
  };
};
