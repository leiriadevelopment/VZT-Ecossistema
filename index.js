const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const cors = require("cors")({ origin: true }); // Permite que seu site chame o robô

admin.initializeApp();

// --- MAPA DO GOOGLE DRIVE (SEUS IDs REAIS) ---
const DRIVE_MAP = {
    adm: "1JzZ4Ey-jKConwxrmZDHZMGou_vIm72i7",       // 01. Administrativo
    sops: "1GNxZCeAe2N2h_S1ap6XzoA1J-pgFJlco",      // 02. Processos e POPs
    patients: "1eVb3UK-d6nfXGiYEcZ2Bnfv1dcXNmnVr",  // 03. Prontuários (Raiz dos Pacientes)
    team: "17N9ZeDp5uRE2pZENpH7-cXNWYeqVPzBw",      // 04. Equipe
    marketing: "1FzIZ00xkNkmfnhzS-3u-UwZN6J1TZoeI"  // 05. Marketing
};

// Autenticação (Identidade Nativa do Google Cloud)
async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return google.drive({ version: "v3", auth });
}

/**
 * ROBÔ 1: CRIAR PRONTUÁRIO DE PACIENTE
 * Recebe: { nome, sobrenome, cpf }
 * Faz: Cria pasta "Sobrenome, Nome - CPF" dentro da pasta 03 + Subpastas
 */
exports.createPatientDrive = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const drive = await getDriveClient();
            const { nome, sobrenome, cpf } = req.body;

            // Validação da Regra de Ouro
            if (!cpf || !nome || !sobrenome) {
                return res.status(400).json({ error: "Dados incompletos. CPF, Nome e Sobrenome são obrigatórios." });
            }

            // Formatação: "Silva, Ana - 123..."
            const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            const folderName = `${capitalize(sobrenome)}, ${capitalize(nome)} - ${cpf}`;

            console.log(`[Drive] Criando estrutura para: ${folderName}`);

            // 1. Criar Pasta Raiz na Pasta 03 (Pacientes)
            const fileMetadata = {
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: [DRIVE_MAP.patients], 
            };

            const folder = await drive.files.create({
                resource: fileMetadata,
                fields: "id, webViewLink",
            });

            const patientFolderId = folder.data.id;
            const driveLink = folder.data.webViewLink;

            // 2. Criar Subpastas Padronizadas
            const subfolders = [
                "1. Documentos Pessoais",
                "2. Contratos Assinados",
                "3. Exames e Risco",
                "4. Fotos (Antes/Depois)",
                "5. Prontuário",
                "6. Logs e Comunicação"
            ];

            // Cria tudo em paralelo (Rápido)
            await Promise.all(subfolders.map(async (subName) => {
                await drive.files.create({
                    resource: {
                        name: subName,
                        mimeType: "application/vnd.google-apps.folder",
                        parents: [patientFolderId]
                    }
                });
            }));

            // Retorna o link para o App salvar no Firestore
            res.status(200).json({ status: "success", driveLink, folderId: patientFolderId });

        } catch (error) {
            console.error("Erro no Drive:", error);
            res.status(500).json({ error: error.message });
        }
    });
});

/**
 * ROBÔ 2: BIBLIOTECÁRIO (LISTAR ARQUIVOS)
 * Recebe: { folderType: 'sops' | 'marketing' | 'adm' }
 * Faz: Lista os arquivos PDF/Doc da pasta solicitada para mostrar no App
 */
exports.listDriveFiles = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const drive = await getDriveClient();
            const { folderType } = req.body; // ex: 'sops'

            const targetFolderId = DRIVE_MAP[folderType];
            if (!targetFolderId) {
                return res.status(400).json({ error: "Tipo de pasta inválido" });
            }

            // Busca arquivos (não deletados) dentro da pasta escolhida
            const response = await drive.files.list({
                q: `'${targetFolderId}' in parents and trashed = false`,
                fields: 'files(id, name, webViewLink, iconLink, mimeType)',
                orderBy: 'name'
            });

            res.status(200).json({ files: response.data.files });

        } catch (error) {
            console.error("Erro ao listar:", error);
            res.status(500).json({ error: error.message });
        }
    });
});
