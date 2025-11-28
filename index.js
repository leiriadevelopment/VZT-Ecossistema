const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { VertexAI } = require('@google-cloud/vertexai');
const cors = require("cors")({ origin: true });

admin.initializeApp();

// ==========================================
// 🗺️ MAPA DO GOOGLE DRIVE (SEUS IDs REAIS)
// ==========================================
const DRIVE_MAP = {
    adm: "1JzZ4Ey-jKConwxrmZDHZMGou_vIm72i7",       // 01. Administrativo
    sops: "1GNxZCeAe2N2h_S1ap6XzoA1J-pgFJlco",      // 02. Processos e POPs
    patients: "1eVb3UK-d6nfXGiYEcZ2Bnfv1dcXNmnVr",  // 03. Prontuários (Raiz)
    team: "17N9ZeDp5uRE2pZENpH7-cXNWYeqVPzBw",      // 04. Equipe
    marketing: "1FzIZ00xkNkmfnhzS-3u-UwZN6J1TZoeI"  // 05. Marketing
};

// CONFIGURAÇÃO GEMINI
const PROJECT_ID = "vzt-ecossistema";
const LOCATION = "us-central1";

// --- AUTENTICAÇÃO DRIVE (Identidade Nativa) ---
async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return google.drive({ version: "v3", auth });
}

// ---------------------------------------------------------
// 🤖 ROBÔ 1: ARQUITETO (CRIAR PRONTUÁRIO)
// ---------------------------------------------------------
exports.createPatientDrive = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const drive = await getDriveClient();
            const { nome, sobrenome, cpf } = req.body;

            if (!cpf) return res.status(400).json({ error: "CPF Obrigatório" });

            const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            const folderName = `${capitalize(sobrenome)}, ${capitalize(nome)} - ${cpf}`;

            console.log("Criando pasta no Drive:", folderName);

            // Cria pasta raiz DENTRO da pasta de Pacientes (Usando o ID do Mapa)
            const fileMetadata = {
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: [DRIVE_MAP.patients], 
            };

            const folder = await drive.files.create({ resource: fileMetadata, fields: "id, webViewLink" });
            
            // Cria subpastas padrão
            const subfolders = ["1. Documentos", "2. Contratos", "3. Exames", "4. Fotos", "5. Prontuário", "6. Logs"];
            await Promise.all(subfolders.map(async (name) => {
                await drive.files.create({
                    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [folder.data.id] }
                });
            }));

            res.status(200).json({ status: "success", driveLink: folder.data.webViewLink });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    });
});

// ---------------------------------------------------------
// 🤖 ROBÔ 2: BIBLIOTECÁRIO (LISTAR ARQUIVOS)
// Permite que o site mostre os arquivos de SOPs ou Marketing
// ---------------------------------------------------------
exports.listDriveFiles = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const drive = await getDriveClient();
            const { folderKey } = req.body; // ex: 'sops', 'marketing', 'adm'

            const targetId = DRIVE_MAP[folderKey];
            if(!targetId) return res.status(400).json({ error: "Pasta inválida" });

            const response = await drive.files.list({
                q: `'${targetId}' in parents and trashed = false`,
                fields: 'files(id, name, webViewLink, iconLink, mimeType)',
                orderBy: 'name'
            });

            res.status(200).json({ files: response.data.files });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    });
});

// ---------------------------------------------------------
// 🤖 ROBÔ 3: INTELIGÊNCIA (GEMINI CHAT)
// ---------------------------------------------------------
exports.chatWithGemini = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const { message, context } = req.body;

            const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
            const model = vertexAI.getGenerativeModel({ model: 'gemini-pro' });

            const systemPrompt = `
                Você é o VZT AI. Contexto: ${context || "Geral"}.
                Se o contexto for um paciente, considere que temos acesso aos exames na pasta do Drive.
                Responda de forma profissional.
            `;

            const result = await model.generateContent(`${systemPrompt}\n\nUsuário: ${message}`);
            const response = result.response.candidates[0].content.parts[0].text;

            res.status(200).json({ reply: response });

        } catch (error) {
            console.error("Erro Gemini:", error);
            res.status(500).json({ error: "Erro na IA." });
        }
    });
});
