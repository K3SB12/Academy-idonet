import { GoogleGenAI, Type } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export function Admin() {
  const { state, addCustomReading, updateReadingPages, deleteSimulatorQuestion, updateSimulatorQuestion, addSimulatorQuestion, addModule, updateModule, deleteModule, addReading, updateReadingTitle, deleteReading, resetUserProgress, updateProductivityData } = useAppContext();
  const [activeTab, setActiveTab] = useState<'documents' | 'simulator' | 'modules' | 'dashboard'>('documents');
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // For replacing existing reading text
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [selectedReadingId, setSelectedReadingId] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'new' | 'replace'>('replace');

  // For simulator management
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);

  // For module management
  const [editingModule, setEditingModule] = useState<{ id: string, title: string, description: string } | null>(null);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);
  
  // For reading management
  const [editingReading, setEditingReading] = useState<{ moduleId: string, id: string, title: string } | null>(null);
  const [deletingReading, setDeletingReading] = useState<{ moduleId: string, id: string } | null>(null);

  // For dashboard management
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingProductivity, setEditingProductivity] = useState(false);
  const [tempProductivityData, setTempProductivityData] = useState(state.productivityData);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pagesText: string[] = [];
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let pageText = '';
      let lastY = -1;
      
      for (const item of textContent.items as any[]) {
        if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 5) {
          pageText += '\n';
        } else if (lastY !== -1) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      
      let cleanText = pageText.trim();

      // Fallback a OCR con IA si la página parece ser una imagen escaneada (menos de 20 caracteres)
      if (cleanText.length < 20) {
        try {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // @ts-ignore
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                parts: [
                  { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                  { text: 'Extrae todo el texto legible de esta imagen de un documento oficial. Devuelve únicamente el texto extraído, sin comentarios adicionales.' }
                ]
              }
            });
            
            if (response.text) {
              cleanText = response.text.trim();
            }
          }
        } catch (ocrError) {
          console.error(`Error OCR en página ${i}:`, ocrError);
        }
      }

      pagesText.push(cleanText || `[Página ${i} en blanco o ilegible]`);
    }

    return pagesText;
  };

  const extractTextFromTXT = async (file: File): Promise<string[]> => {
    const text = await file.text();
    // Split by double newlines or chunks of 2000 chars to simulate pages
    const chunks = text.split('\n\n').filter(c => c.trim().length > 0);
    const pages: string[] = [];
    let currentPage = '';
    
    for (const chunk of chunks) {
      if (currentPage.length + chunk.length > 2000) {
        pages.push(currentPage);
        currentPage = chunk;
      } else {
        currentPage += (currentPage ? '\n\n' : '') + chunk;
      }
    }
    if (currentPage) pages.push(currentPage);
    
    return pages.length > 0 ? pages : [text];
  };

  const processReplaceDocument = async () => {
    if (!file || !selectedModuleId || !selectedReadingId) {
      setError('Por favor, selecciona un archivo, un módulo y una lectura.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let pages: string[] = [];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        pages = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        pages = await extractTextFromTXT(file);
      } else {
        throw new Error('Formato no soportado para reemplazo. Usa PDF o TXT.');
      }

      if (pages.length === 0) {
        throw new Error('No se pudo extraer texto del documento.');
      }

      updateReadingPages(selectedModuleId, selectedReadingId, pages);
      setSuccessMessage(`¡Éxito! Se actualizaron ${pages.length} páginas para la lectura seleccionada.`);
      setFile(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar el documento.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processNewDocument = async () => {
    if (!file) {
      setError('Por favor, selecciona un archivo primero.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Leer el archivo como Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const mimeType = file.type || 'application/pdf';

          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType,
                  }
                },
                {
                  text: `Eres un experto en diseño instruccional para el Ministerio de Educación Pública de Costa Rica. 
                  Analiza el documento adjunto y genera:
                  1. Un título corto y descriptivo.
                  2. Un resumen ejecutivo de máximo 3 párrafos enfocado en los puntos clave para un Asesor Nacional.
                  3. 3 preguntas de selección única (casos prácticos) basadas en el documento.
                  
                  Devuelve la respuesta estrictamente en formato JSON siguiendo este esquema.`
                }
              ]
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        text: { type: Type.STRING },
                        options: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING }
                        },
                        correctAnswer: { type: Type.INTEGER, description: "Índice de la respuesta correcta (0-3)" },
                        explanation: { type: Type.STRING }
                      },
                      required: ["text", "options", "correctAnswer", "explanation"]
                    }
                  }
                },
                required: ["title", "summary", "questions"]
              }
            }
          });

          const jsonStr = response.text?.trim();
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            const newReading: CustomReading = {
              id: `custom_${Date.now()}`,
              title: data.title,
              summary: data.summary,
              questions: data.questions.map((q: any, i: number) => ({ ...q, id: `cq_${Date.now()}_${i}` }))
            };
            addCustomReading(newReading);
            setSuccessMessage('¡Módulo generado con éxito!');
            setFile(null);
          } else {
            throw new Error("No se recibió respuesta válida del modelo.");
          }
        } catch (err: any) {
          console.error(err);
          setError(err.message || 'Error al procesar el documento con IA.');
        } finally {
          setIsProcessing(false);
        }
      };

      reader.onerror = () => {
        setError('Error al leer el archivo local.');
        setIsProcessing(false);
      };

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error inesperado.');
      setIsProcessing(false);
    }
  };

  const handleProcess = () => {
    if (uploadMode === 'replace') {
      processReplaceDocument();
    } else {
      processNewDocument();
    }
  };

  const selectedModule = state.modules.find(m => m.id === selectedModuleId);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Panel de Administración</h2>
        <p className="text-zinc-400 mt-1">Gestión de lecturas y simulador de idoneidad</p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'documents'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Gestión de Documentos
          </div>
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'simulator'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" />
            Gestión del Simulador
          </div>
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'modules'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Gestión de Módulos
          </div>
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'dashboard'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Gestión del Dashboard
          </div>
        </button>
      </div>

      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Upload Section */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-500" />
                Subir Documento
              </h3>

              {/* Mode Toggle */}
              <div className="flex bg-black/20 p-1 rounded-lg mb-6 border border-white/10">
                <button
                  onClick={() => setUploadMode('replace')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${uploadMode === 'replace' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Reemplazar Texto
                </button>
                <button
                  onClick={() => setUploadMode('new')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${uploadMode === 'new' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Generar Nuevo
                </button>
              </div>

              {/* Replace Mode Selectors */}
              {uploadMode === 'replace' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Módulo Destino</label>
                    <select 
                      value={selectedModuleId}
                      onChange={(e) => {
                        setSelectedModuleId(e.target.value);
                        setSelectedReadingId('');
                      }}
                      className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Selecciona un módulo...</option>
                      {state.modules.map(m => (
                        <option key={m.id} value={m.id}>{m.title}</option>
                      ))}
                    </select>
                  </div>

                  {selectedModule && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Lectura a Reemplazar</label>
                      <select 
                        value={selectedReadingId}
                        onChange={(e) => setSelectedReadingId(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Selecciona una lectura...</option>
                        {selectedModule.readings.map(r => (
                          <option key={r.id} value={r.id}>{r.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-2 border-dashed border-white/10 hover:border-blue-500/50 transition-colors rounded-xl p-8 text-center bg-black/20">
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={handleFileChange}
                />
                <label 
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-3"
                >
                  <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-sm">
                    <span className="text-blue-400 font-medium">Haz clic para subir</span> o arrastra un archivo
                  </div>
                  <p className="text-xs text-zinc-500">PDF, TXT, DOCX (Max 10MB)</p>
                </label>
              </div>

              {file && (
                <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg flex items-center justify-between border border-zinc-700/50">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-zinc-300 truncate">{file.name}</span>
                  </div>
                  <button onClick={() => setFile(null)} className="text-zinc-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> {successMessage}
                </div>
              )}

              <button
                onClick={handleProcess}
                disabled={!file || isProcessing || (uploadMode === 'replace' && (!selectedModuleId || !selectedReadingId))}
                className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-medium transition-colors"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    {uploadMode === 'replace' ? <BookOpen className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {uploadMode === 'replace' ? 'Actualizar Lectura' : 'Generar Módulo'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Content List */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-semibold text-zinc-100">Lecturas Generadas con IA</h3>
            
            {state.customReadings.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center text-zinc-500">
                No hay lecturas personalizadas generadas aún. Sube un documento para comenzar.
              </div>
            ) : (
              <div className="space-y-4">
                {state.customReadings.map((reading) => (
                  <div key={reading.id} className="glass-panel rounded-2xl p-6">
                    <h4 className="text-lg font-bold text-emerald-400 mb-2">{reading.title}</h4>
                    <p className="text-sm text-zinc-300 leading-relaxed mb-6">{reading.summary}</p>
                    
                    <div className="space-y-4">
                      <h5 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Preguntas Generadas ({reading.questions.length})</h5>
                      {reading.questions.map((q, i) => (
                        <div key={q.id} className="bg-black/20 border border-white/5 rounded-xl p-4">
                          <p className="text-sm font-medium text-zinc-200 mb-3"><span className="text-zinc-500 mr-2">{i+1}.</span>{q.text}</p>
                          <div className="space-y-2 pl-6">
                            {q.options.map((opt, j) => (
                              <div key={j} className={`text-xs p-2 rounded ${j === q.correctAnswer ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-500'}`}>
                                {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-zinc-100">Preguntas del Simulador ({state.simulatorQuestions.length})</h3>
            <button 
              onClick={() => {
                setEditingQuestion({
                  id: `q_${Date.now()}`,
                  text: '',
                  options: ['', '', '', ''],
                  correctAnswer: 0,
                  explanation: ''
                });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-medium text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva Pregunta
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {state.simulatorQuestions.map((q, index) => (
              <div key={q.id} className="glass-panel rounded-2xl p-6 relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button 
                    onClick={() => setEditingQuestion(q)}
                    className="p-2 bg-zinc-800 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                    title="Editar pregunta"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeletingQuestionId(q.id)}
                    className="p-2 bg-zinc-800 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    title="Eliminar pregunta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="pr-20">
                  <h4 className="text-base font-medium text-zinc-200 mb-4">
                    <span className="text-zinc-500 mr-2">{index + 1}.</span>
                    {q.text}
                  </h4>
                  <div className="space-y-2 mb-4">
                    {q.options.map((opt, i) => (
                      <div 
                        key={i} 
                        className={`p-3 rounded-xl text-sm border ${
                          i === q.correctAnswer 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                            : 'bg-black/20 border-white/5 text-zinc-400'
                        }`}
                      >
                        <span className="font-medium mr-2">{['A', 'B', 'C', 'D'][i]})</span>
                        {opt}
                      </div>
                    ))}
                  </div>
                  <div className="bg-black/20 border border-white/10 rounded-xl p-4">
                    <p className="text-sm text-zinc-400">
                      <span className="font-medium text-zinc-300">Justificación:</span> {q.explanation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {state.simulatorQuestions.length === 0 && (
            <div className="glass-panel rounded-2xl p-12 text-center text-zinc-500">
              No hay preguntas en el simulador. Genera casos de estudio desde los módulos o crea una nueva pregunta.
            </div>
          )}
        </div>
      )}

      {activeTab === 'modules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-zinc-100">Módulos de Destino ({state.modules.length})</h3>
            <button 
              onClick={() => setEditingModule({ id: `m_${Date.now()}`, title: '', description: '' })}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-medium text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Módulo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {state.modules.map((m) => (
              <div key={m.id} className="glass-panel rounded-2xl p-6 relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button 
                    onClick={() => setEditingModule({ id: m.id, title: m.title, description: m.description })}
                    className="p-2 bg-zinc-800 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                    title="Editar módulo"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setDeletingModuleId(m.id)}
                    className="p-2 bg-zinc-800 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    title="Eliminar módulo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="pr-20 mb-6">
                  <h4 className="text-lg font-bold text-zinc-100 mb-2">{m.title}</h4>
                  <p className="text-sm text-zinc-400">{m.description}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Lecturas a Reemplazar ({m.readings.length})</h5>
                    <button 
                      onClick={() => setEditingReading({ moduleId: m.id, id: `r_${Date.now()}`, title: '' })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Añadir Lectura
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {m.readings.map(r => (
                      <div key={r.id} className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between group/reading">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <BookOpen className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="text-sm text-zinc-300 truncate" title={r.title}>{r.title}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover/reading:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setEditingReading({ moduleId: m.id, id: r.id, title: r.title })}
                            className="p-1.5 text-zinc-500 hover:text-blue-400 transition-colors"
                            title="Editar nombre"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setDeletingReading({ moduleId: m.id, id: r.id })}
                            className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Eliminar lectura"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {m.readings.length === 0 && (
                      <div className="col-span-full text-sm text-zinc-500 italic py-2">
                        No hay lecturas en este módulo.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {state.modules.length === 0 && (
            <div className="glass-panel rounded-2xl p-12 text-center text-zinc-500">
              No hay módulos creados. Crea uno nuevo para comenzar.
            </div>
          )}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-zinc-100 mb-6 flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-emerald-500" />
              Datos del Gráfico de Productividad
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
                {tempProductivityData.map((data, index) => (
                  <div key={data.day} className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-400 text-center">{data.day}</label>
                    <input
                      type="number"
                      value={data.focus}
                      disabled={!editingProductivity || data.day === 'Dom'}
                      onChange={(e) => {
                        const newData = [...tempProductivityData];
                        newData[index].focus = parseInt(e.target.value) || 0;
                        setTempProductivityData(newData);
                      }}
                      className="w-full p-2 bg-black/20 border border-white/10 rounded-lg text-zinc-100 text-center focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    />
                    {data.day === 'Dom' && <p className="text-[10px] text-zinc-500 text-center leading-tight">Auto (Tiempo Real)</p>}
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                {editingProductivity ? (
                  <>
                    <button
                      onClick={() => {
                        setTempProductivityData(state.productivityData);
                        setEditingProductivity(false);
                      }}
                      className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        updateProductivityData(tempProductivityData);
                        setEditingProductivity(false);
                      }}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-sm font-medium rounded-xl transition-colors"
                    >
                      Guardar Datos
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setTempProductivityData(state.productivityData);
                      setEditingProductivity(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar Datos
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-rose-500 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Zona de Peligro
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              Estas acciones afectarán el progreso actual del usuario en la aplicación.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-black/20 p-4 rounded-xl border border-rose-500/10">
              <div>
                <h4 className="text-zinc-200 font-medium">Reiniciar Progreso del Usuario</h4>
                <p className="text-xs text-zinc-500 mt-1">Borra el tiempo de enfoque, progreso de módulos y puntajes del simulador.</p>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
              >
                Reiniciar Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-zinc-100 mb-6">
              {state.simulatorQuestions.some(q => q.id === editingQuestion.id) ? 'Editar Pregunta' : 'Nueva Pregunta'}
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Pregunta / Caso de Estudio</label>
                <textarea 
                  value={editingQuestion.text}
                  onChange={e => setEditingQuestion({...editingQuestion, text: e.target.value})}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500 min-h-[100px] resize-y"
                  placeholder="Escribe el caso o la pregunta..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Opciones</label>
                <div className="space-y-3">
                  {editingQuestion.options.map((opt, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <button
                        onClick={() => setEditingQuestion({...editingQuestion, correctAnswer: i})}
                        className={`mt-2 w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                          editingQuestion.correctAnswer === i 
                            ? 'bg-emerald-500 border-emerald-500' 
                            : 'border-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        {editingQuestion.correctAnswer === i && <div className="w-2 h-2 bg-black rounded-full" />}
                      </button>
                      <textarea 
                        value={opt}
                        onChange={e => {
                          const newOptions = [...editingQuestion.options];
                          newOptions[i] = e.target.value;
                          setEditingQuestion({...editingQuestion, options: newOptions});
                        }}
                        className={`w-full p-3 bg-black/20 border rounded-xl text-sm focus:outline-none focus:border-emerald-500 resize-y min-h-[60px] ${
                          editingQuestion.correctAnswer === i ? 'border-emerald-500/50 text-emerald-400' : 'border-zinc-800 text-zinc-200'
                        }`}
                        placeholder={`Opción ${['A', 'B', 'C', 'D'][i]}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Justificación</label>
                <textarea 
                  value={editingQuestion.explanation}
                  onChange={e => setEditingQuestion({...editingQuestion, explanation: e.target.value})}
                  className="w-full p-3 bg-black/20 border border-white/10 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500 min-h-[80px] resize-y"
                  placeholder="Explica por qué la opción seleccionada es la correcta..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-zinc-800">
              <button 
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (state.simulatorQuestions.some(q => q.id === editingQuestion.id)) {
                    updateSimulatorQuestion(editingQuestion.id, editingQuestion);
                  } else {
                    addSimulatorQuestion(editingQuestion);
                  }
                  setEditingQuestion(null);
                }}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-sm font-medium rounded-xl transition-colors"
                id="save-question-btn"
              >
                Guardar Pregunta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingQuestionId && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-2">Eliminar Pregunta</h3>
            <p className="text-sm text-zinc-400 mb-6">¿Estás seguro de que deseas eliminar esta pregunta del simulador? Esta acción no se puede deshacer.</p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingQuestionId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  deleteSimulatorQuestion(deletingQuestionId);
                  setDeletingQuestionId(null);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Module Modal */}
      {editingModule && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-zinc-100 mb-6">
              {state.modules.some(m => m.id === editingModule.id) ? 'Editar Módulo' : 'Nuevo Módulo'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Título del Módulo</label>
                <input 
                  type="text"
                  value={editingModule.title}
                  onChange={e => setEditingModule({...editingModule, title: e.target.value})}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Módulo 1: Introducción..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Descripción</label>
                <textarea 
                  value={editingModule.description}
                  onChange={e => setEditingModule({...editingModule, description: e.target.value})}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500 min-h-[100px] resize-y"
                  placeholder="Breve descripción del módulo..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-zinc-800">
              <button 
                onClick={() => setEditingModule(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (state.modules.some(m => m.id === editingModule.id)) {
                    updateModule(editingModule.id, editingModule.title, editingModule.description);
                  } else {
                    addModule(editingModule.title, editingModule.description);
                  }
                  setEditingModule(null);
                }}
                disabled={!editingModule.title.trim()}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-medium rounded-xl transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Module Modal */}
      {deletingModuleId && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-2">Eliminar Módulo</h3>
            <p className="text-sm text-zinc-400 mb-6">¿Estás seguro de que deseas eliminar este módulo y todas sus lecturas? Esta acción no se puede deshacer.</p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingModuleId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  deleteModule(deletingModuleId);
                  setDeletingModuleId(null);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reading Modal */}
      {editingReading && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-zinc-100 mb-6">
              {state.modules.find(m => m.id === editingReading.moduleId)?.readings.some(r => r.id === editingReading.id) ? 'Editar Lectura' : 'Añadir Lectura'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Nombre de la Lectura</label>
                <input 
                  type="text"
                  value={editingReading.title}
                  onChange={e => setEditingReading({...editingReading, title: e.target.value})}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Ley de Control Interno..."
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-zinc-800">
              <button 
                onClick={() => setEditingReading(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const module = state.modules.find(m => m.id === editingReading.moduleId);
                  if (module?.readings.some(r => r.id === editingReading.id)) {
                    updateReadingTitle(editingReading.moduleId, editingReading.id, editingReading.title);
                  } else {
                    addReading(editingReading.moduleId, editingReading.title);
                  }
                  setEditingReading(null);
                }}
                disabled={!editingReading.title.trim()}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-medium rounded-xl transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Reading Modal */}
      {deletingReading && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-2">Eliminar Lectura</h3>
            <p className="text-sm text-zinc-400 mb-6">¿Estás seguro de que deseas eliminar esta lectura? Esta acción no se puede deshacer.</p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setDeletingReading(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  deleteReading(deletingReading.moduleId, deletingReading.id);
                  setDeletingReading(null);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-2">¿Reiniciar Progreso?</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Esto pondrá a cero el tiempo de enfoque, el progreso de todos los módulos y el historial del simulador. Esta acción no se puede deshacer.
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  resetUserProgress();
                  setShowResetConfirm(false);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors"
              >
                Sí, Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
