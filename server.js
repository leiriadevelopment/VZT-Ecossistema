const express = require('express');
const path = require('path');
const app = express();

// Define a porta que o Google vai usar (ou 8080 localmente)
const port = process.env.PORT || 8080;

// Serve todos os arquivos estáticos (seu CSS, JS, Imagens)
app.use(express.static('.'));

// Qualquer rota leva ao index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`VZT Server rodando na porta ${port}`);
});