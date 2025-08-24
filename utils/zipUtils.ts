import JSZip from 'jszip';
import { GeneratedFile } from '../types';

/**
 * Creates a ZIP file from an array of file objects and triggers a download.
 * @param files - An array of objects, where each object has a 'name' and 'content'.
 * @param zipName - The desired name for the downloaded ZIP file (e.g., 'project.zip').
 */
export const createAndDownloadZip = async (files: GeneratedFile[], zipName: string): Promise<void> => {
  const zip = new JSZip();

  files.forEach(file => {
    zip.file(file.name, file.content);
  });

  try {
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = zipName;
    
    // Append to body to ensure visibility in all browsers
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

  } catch (error) {
    console.error("Error creating ZIP file:", error);
    // You might want to show an error message to the user here
  }
};
