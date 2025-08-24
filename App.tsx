import React, { useState, useRef, useEffect } from 'react';
import { GeneratedFile } from './types';
import { generateScriptBundle } from './services/geminiService';
import { createAndDownloadZip } from './utils/zipUtils';

// Types for the file tree structure
type FileTreeNode = {
  name: string;
  type: 'file';
  path: string;
} | {
  name: string;
  type: 'folder';
  children: FileTreeNode[];
};


// Helper to convert files to a tree structure
const buildFileTree = (files: GeneratedFile[]): FileTreeNode[] => {
  const root: { [key: string]: FileTreeNode } = {};

  files.forEach(file => {
    const parts = file.name.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) { // It's a file
        currentLevel[part] = { name: part, type: 'file', path: file.name };
      } else { // It's a directory
        if (!currentLevel[part]) {
          currentLevel[part] = { name: part, type: 'folder', children: [] };
        }
        // This is a type assertion to satisfy TypeScript
        const folderNode = currentLevel[part] as { children: any[] };
        currentLevel = folderNode.children as any; // Navigate deeper
      }
    });
  });

  // Convert the object-based tree to an array
  const treeToArray = (node: { [key: string]: FileTreeNode }): FileTreeNode[] => {
    return Object.values(node).sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
  };

  return treeToArray(root);
};


// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [platform, setPlatform] = useState('web');
  const [moduleSystem, setModuleSystem] = useState('esm');
  const [database, setDatabase] = useState('none');
  const [image, setImage] = useState<{ file: File, preview: string, base64: string } | null>(null);

  const [chatHistory, setChatHistory] = useState<{ type: 'user' | 'ai' | 'system', content: string, files?: GeneratedFile[] }[]>([]);
  const [isFirstRequest, setIsFirstRequest] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [viewingFile, setViewingFile] = useState<GeneratedFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setImage({ file, preview: URL.createObjectURL(file), base64 });
    }
  };

  const constructFullPrompt = () => {
    let fullPrompt = '';
    if (isFirstRequest) {
      fullPrompt += `**Initial Project Specifications:**\n- Language: ${language}\n- Platform: ${platform}\n${['javascript', 'typescript'].includes(language) ? `- Module System: ${moduleSystem}` : ''}\n- Database: ${database}\n\n**User Request:**\n${prompt}`;
    } else {
      fullPrompt = `**Follow-up Request:**\n${prompt}`;
    }
    return fullPrompt;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const currentPrompt = constructFullPrompt();
    const currentFiles = [...chatHistory].reverse().find(m => m.files)?.files ?? [];

    setChatHistory(prev => [...prev, { type: 'user', content: prompt, files: image ? [ { name: image.file.name, content: 'User uploaded an image.'} ] : undefined }]);
    setIsLoading(true);
    setError('');
    setPrompt('');
    setImage(null);

    try {
      const result = await generateScriptBundle(currentPrompt, currentFiles, image?.base64);
      setChatHistory(prev => [...prev, { type: 'ai', content: "Project files are ready or have been updated.", files: result }]);
      if(isFirstRequest) setIsFirstRequest(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setChatHistory(prev => [...prev, { type: 'system', content: `Error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    const latestFiles = [...chatHistory].reverse().find(msg => msg.files)?.files;
    if (!latestFiles) return;

    const firstUserMessage = chatHistory.find(msg => msg.type === 'user')?.content || 'ai-project';
    const projectName = firstUserMessage.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'ai-generated-project';
    createAndDownloadZip(latestFiles, `${projectName}.zip`);
  };
  
  const latestFiles = [...chatHistory].reverse().find(msg => msg.files)?.files;
  const fileTree = latestFiles ? buildFileTree(latestFiles) : [];

  const handleFileClick = (path: string) => {
      const file = latestFiles?.find(f => f.name === path);
      if (file) {
          setViewingFile(file);
      }
  };

  return (
    <>
      <div className="min-h-screen bg-black text-white flex flex-col p-4 font-mono">
        <header className="text-center my-6">
          <h1 className="text-5xl font-bold tracking-tighter">Script Generate</h1>
        </header>
        
        <main className="flex-grow flex flex-col md:flex-row gap-4 max-w-7xl w-full mx-auto overflow-hidden">
          
          <div className="w-full md:w-1/3 flex flex-col gap-4">
              {isFirstRequest && (
                <div className="bg-[#111] border border-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-3 text-gray-200">Initial Setup</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <OptionSelect id="language-select" label="Language" value={language} onChange={e => setLanguage(e.target.value)} disabled={isLoading}>
                      <option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="golang">Go</option>
                    </OptionSelect>
                    <OptionSelect id="platform-select" label="Platform" value={platform} onChange={e => setPlatform(e.target.value)} disabled={isLoading}>
                      <option value="web">Web Server</option><option value="discord">Discord Bot</option><option value="telegram">Telegram Bot</option><option value="whatsapp">WhatsApp Bot</option>
                    </OptionSelect>
                    <OptionSelect id="database-select" label="Database" value={database} onChange={e => setDatabase(e.target.value)} disabled={isLoading}>
                       <option value="none">None</option><option value="json">JSON</option><option value="sqlite">SQLite</option><option value="mysql">MySQL</option><option value="mongodb">MongoDB</option>
                    </OptionSelect>
                    {['javascript', 'typescript'].includes(language) && (
                        <OptionSelect id="module-select" label="Module System" value={moduleSystem} onChange={e => setModuleSystem(e.target.value)} disabled={isLoading}>
                            <option value="esm">ESM</option><option value="commonjs">CommonJS</option>
                        </OptionSelect>
                    )}
                  </div>
                </div>
              )}
              
              <div className="bg-[#111] border border-gray-800 rounded-lg p-4 flex-grow">
                  <h2 className="text-lg font-semibold mb-3 text-gray-200">Project Files</h2>
                  {fileTree.length > 0 ? (
                      <>
                          <div className="max-h-96 overflow-y-auto pr-2">
                            <FileTreeView nodes={fileTree} onFileClick={handleFileClick} />
                          </div>
                          <button onClick={handleDownload} className="mt-4 w-full bg-white hover:bg-gray-200 text-black font-bold py-2 px-4 rounded-md transition-all duration-200">Download .zip</button>
                      </>
                  ) : (
                      <p className="text-sm text-gray-500">Your generated files will appear here.</p>
                  )}
              </div>
          </div>

          <div className="w-full md:w-2/3 flex flex-col bg-[#111] border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex-grow p-4 space-y-4 overflow-y-auto">
               {chatHistory.length === 0 && <p className="text-center text-gray-500">Start by describing your project.</p>}
               {chatHistory.map((msg, index) => (
                  <div key={index} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-xl p-3 rounded-lg ${msg.type === 'user' ? 'bg-gray-700' : 'bg-gray-800'} ${msg.type === 'system' ? 'bg-red-900/50 w-full text-center text-red-300' : ''}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.type === 'ai' && msg.files && <p className="text-xs text-gray-400 mt-2">✅ Project files updated. Click on a file to view.</p>}
                    </div>
                  </div>
               ))}
               {isLoading && 
                <div className="flex justify-start animate-fade-in">
                    <div className="max-w-lg p-3 rounded-lg bg-gray-800 flex items-center">
                        <span>Thinking</span>
                        <span className="animate-pulse delay-100">.</span>
                        <span className="animate-pulse delay-200">.</span>
                        <span className="animate-pulse delay-300">.</span>
                    </div>
                </div>
                }
               <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-gray-800 bg-black">
               {error && <div className="text-red-400 mb-2 text-sm">{error}</div>}
               {image && (
                  <div className="mb-2 flex items-center gap-2 animate-fade-in">
                      <img src={image.preview} alt="upload preview" className="h-12 w-12 object-cover rounded"/>
                      <span className="text-sm text-gray-400">{image.file.name}</span>
                      <button onClick={() => { setImage(null); if(fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-auto text-red-500 hover:text-red-400 text-xs">Remove</button>
                  </div>
               )}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="file" accept="image/*" onChange={handleImageChange} ref={fileInputRef} className="hidden"/>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition" aria-label="Attach image">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleSubmit(e as any); }}
                  placeholder={isFirstRequest ? "Describe your project..." : "Add a feature or describe an error..."}
                  className="w-full bg-gray-800 border border-gray-600 rounded-md px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white resize-none"
                  rows={1}
                  disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || !prompt.trim()} className="bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold py-2 px-6 rounded-md transition-all duration-200">Send</button>
              </form>
            </div>
          </div>
        </main>

        <footer className="text-center mt-auto pt-8 text-gray-600 text-sm">
          <p>Kredit by Nathan</p>
        </footer>
      </div>
      {viewingFile && <CodeViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />}
    </>
  );
};


const FileTreeView: React.FC<{ nodes: FileTreeNode[], onFileClick: (path: string) => void }> = ({ nodes, onFileClick }) => {
    return (
        <div className="text-sm text-gray-300 space-y-1">
            {nodes.map(node => <FileTreeItem key={node.name} node={node} onFileClick={onFileClick} />)}
        </div>
    );
};

const FileTreeItem: React.FC<{ node: FileTreeNode, onFileClick: (path: string) => void, level?: number }> = ({ node, onFileClick, level = 0 }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (node.type === 'folder') {
        return (
            <div>
                <div onClick={() => setIsOpen(!isOpen)} className="flex items-center cursor-pointer hover:bg-gray-800 rounded px-1">
                    <span style={{ paddingLeft: `${level * 16}px` }}>
                        {isOpen ? '▼' : '►'}
                    </span>
                    <span className="ml-2 text-gray-400">📁</span>
                    <span className="ml-2 font-semibold">{node.name}</span>
                </div>
                {isOpen && (
                    <div className="mt-1">
                        {node.children.map(child => <FileTreeItem key={child.name} node={child} onFileClick={onFileClick} level={level + 1} />)}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div onClick={() => onFileClick(node.path)} style={{ paddingLeft: `${level * 16}px` }} className="flex items-center cursor-pointer hover:bg-gray-800 rounded px-1 py-0.5">
           <span className="ml-2 text-gray-500">📄</span>
           <span className="ml-2">{node.name}</span>
        </div>
    );
};

const CodeViewerModal: React.FC<{ file: GeneratedFile, onClose: () => void }> = ({ file, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-[#111] border border-gray-800 rounded-lg max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-3 border-b border-gray-800">
                    <code className="text-gray-300">{file.name}</code>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <pre className="p-4 overflow-auto flex-grow"><code className="text-sm">{file.content}</code></pre>
            </div>
        </div>
    );
};

const OptionSelect: React.FC<{id: string, label: string, value: string, disabled: boolean, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, children: React.ReactNode}> = ({id, label, value, onChange, disabled, children}) => (
  <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      <select id={id} value={value} onChange={onChange} disabled={disabled} className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white transition">
          {children}
      </select>
  </div>
);

export default App;
