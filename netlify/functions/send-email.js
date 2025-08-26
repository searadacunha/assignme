exports.handler = async (event, context) => {
  // Vérifier que c'est une requête POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Récupérer l'email depuis le body de la requête
    const { email } = JSON.parse(event.body);

    // Ici vous pouvez envoyer l'email via un service comme SendGrid, Mailgun, etc.
    // Pour l'instant, on simule juste l'envoi
    
    console.log(`Nouveau contact reçu: ${email}`);
    
    // Dans un vrai cas, vous enverriez l'email à contact@assignme.fr ici
    // Exemple avec fetch vers un service d'email :
    /*
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'contact@assignme.fr' }]
        }],
        from: { email: 'noreply@assignme.fr' },
        subject: 'Nouveau contact depuis le site',
        content: [{
          type: 'text/plain',
          value: `Nouvelle demande de contact de : ${email}`
        }]
      })
    });
    */

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Email envoyé avec succès' 
      })
    };

  } catch (error) {
    console.error('Erreur:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur lors de l\'envoi de l\'email' 
      })
    };
  }
};
