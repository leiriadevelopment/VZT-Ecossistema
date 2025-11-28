const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();

// --- CONFIGURAÇÃO ---
// COLAR AQUI O ID DA PASTA DO DRIVE (aquela sequência de letras/números no final do link da pasta)
const PARENT_FOLDER_ID = "1eVb3UK-d6nfXGiYEcZ2Bnfv1dcXNmnVr"; 

// Autenticação Moderna (Sem arquivo JSON)
async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        // O robô usa a identidade interna do servidor. Não precisa de arquivo.
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return google.drive({ version: "v3", auth });
}

// --- ROBÔ: CRIAR PRONTUÁRIO ---
exports.hubspotToDrive = functions.https.onRequest(async (req, res) => {
    try {
        const drive = await getDriveClient();
        const data = req.body;

        // 1. Validação
        // Tenta pegar o CPF de várias formas possíveis que o HubSpot envia
        const cpf = data.properties?.cpf?.value || data.cpf;
        const nome = data.properties?.firstname?.value || data.firstname;
        const sobrenome = data.properties?.lastname?.value || data.lastname;

        if (!cpf) {
            return res.status(400).send("Erro: CPF obrigatório não encontrado.");
        }

        // 2. Formatação (Sobrenome, Nome - CPF)
        const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
        const folderName = `${capitalize(sobrenome)}, ${capitalize(nome)} - ${cpf}`;

        console.log(`Criando pasta: ${folderName}`);

        // 3. Criar Pasta
        const fileMetadata = {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [PARENT_FOLDER_ID],
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: "id, webViewLink",
        });

        // 4. Criar Subpastas
        const subfolders = [
            "1. Documentos", "2. Contratos", "3. Exames", 
            "4. Fotos", "5. Prontuário", "6. Logs"
        ];

        await Promise.all(subfolders.map(async (name) => {
            await drive.files.create({
                resource: {
                    name: name,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [folder.data.id]
                }
            });
        }));

        res.status(200).json({
            message: "Sucesso",
            link: folder.data.webViewLink
        });

    } catch (error) {
        console.error("Erro no Drive:", error);
        res.status(500).send("Erro: " + error.message);
    }
});