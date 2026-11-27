// What the library API sends the browser.
type LibraryFolder = { id: number; name: string; count: number };
export type LibraryMessage = {
  id: number;
  folderId: number | null;
  title: string;
  text: string;
  price: number;
  aiPricing: boolean;
  media: { id: string; type: string }[];
  accountIds: string[];
  createdAt: number;
};
export type LibraryView = { folders: LibraryFolder[]; messages: LibraryMessage[]; settings: { fallbackName: string; capitalize: boolean } };
