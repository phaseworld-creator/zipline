export interface FolderFileEntry {
  file: File;
  relativePath: string;
}

export async function extractFilesFromFolderEntry(
  entry: FileSystemEntry,
  basePath = '',
): Promise<FolderFileEntry[]> {
  const entries: FolderFileEntry[] = [];

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    entries.push({ file, relativePath: basePath + file.name });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();

    const readEntries = async (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    };

    let dirEntries = await readEntries();
    while (dirEntries.length > 0) {
      for (const childEntry of dirEntries) {
        const childEntries = await extractFilesFromFolderEntry(childEntry, basePath + dirEntry.name + '/');
        entries.push(...childEntries);
      }
      dirEntries = await readEntries();
    }
  }

  return entries;
}

export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<FolderFileEntry[]> {
  const entries: FolderFileEntry[] = [];

  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          const folderEntries = await extractFilesFromFolderEntry(entry);
          entries.push(...folderEntries);
        } else {
          const file = item.getAsFile();
          if (file) {
            entries.push({ file, relativePath: file.name });
          }
        }
      }
    }
  } else if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      entries.push({ file, relativePath: file.name });
    }
  }

  return entries;
}

export function isFolderDrop(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry && entry.isDirectory) {
          return true;
        }
      }
    }
  }
  return false;
}
