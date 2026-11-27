export const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EyeIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M3 3l14 14M8.2 4.8A8.6 8.6 0 0 1 10 4.5c5.5 0 8.5 5.5 8.5 5.5a14 14 0 0 1-2.6 3.2M5.6 6.2A14 14 0 0 0 1.5 10S4.5 15.5 10 15.5c1.3 0 2.5-.3 3.5-.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LockIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <rect x="4.2" y="8.8" width="11.6" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6.8 8.8V6.6a3.2 3.2 0 0 1 6.4 0v2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...stroke}>{children}</svg>
);
export const UserIcon = () => <Icon><circle cx="10" cy="7" r="3.2" /><path d="M3.8 16.5c.8-3 3.3-4.6 6.2-4.6s5.4 1.6 6.2 4.6" /></Icon>;
export const ChatIcon = () => <Icon><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z" /></Icon>;
export const SunIcon = () => <Icon><circle cx="10" cy="10" r="3" /><path d="M10 3v1.6M10 15.4V17M3 10h1.6M15.4 10H17M5.1 5.1l1.1 1.1M13.8 13.8l1.1 1.1M5.1 14.9l1.1-1.1M13.8 6.2l1.1-1.1" /></Icon>;
export const RulerIcon = () => <Icon><rect x="2.8" y="7" width="14.4" height="6" rx="1.2" /><path d="M6 7v2.4M9 7v3M12 7v2.4M15 7v3" /></Icon>;
export const ImageIcon = () => <Icon><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.3" r="1.2" /><path d="M3.5 14l4-3.5 3 2.5 2.5-2 3.5 3" /></Icon>;
export const HeartIcon = () => <Icon><path d="M10 16.5S3.5 12.6 3.5 8A3.2 3.2 0 0 1 10 6.7 3.2 3.2 0 0 1 16.5 8c0 4.6-6.5 8.5-6.5 8.5z" /></Icon>;
export const LinkIcon = () => <Icon><path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2L9.8 5.9" /><path d="M11.4 8.6a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l1.2-1.1" /></Icon>;
export const CloseIcon = () => <Icon><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></Icon>;
export const ChevronDownIcon = () => <Icon><path d="M5 7.8l5 5 5-5" /></Icon>;
export const BulbIcon = () => <Icon><path d="M7.5 14.5h5M8 17h4M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" /></Icon>;
export const BookIcon = () => <Icon><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v13H5.5A1.5 1.5 0 0 0 4 17.5zM4 17.5A1.5 1.5 0 0 0 5.5 19H16" /></Icon>;
export const FlaskIcon = () => <Icon><path d="M8 3h4M9 3v5l-4.5 7.5A1.5 1.5 0 0 0 5.8 18h8.4a1.5 1.5 0 0 0 1.3-2.5L11 8V3M6.5 13h7" /></Icon>;
export const MegaphoneIcon = () => <Icon><path d="M3.5 8.5v3l9 4v-11zM12.5 7.5c2 0 3.5.8 3.5 2.5s-1.5 2.5-3.5 2.5M5.5 11.5L6.5 16" /></Icon>;
export const NewsIcon = () => <Icon><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M6 8h8M6 11h8M6 14h4" /></Icon>;
export const SparkIcon = () => <Icon><path d="M10 3l1.7 4.3L16 9l-4.3 1.7L10 15l-1.7-4.3L4 9l4.3-1.7zM15.5 14.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></Icon>;
export const SmileIcon = () => <Icon><circle cx="10" cy="10" r="7" /><path d="M7 11.6c.8 1.2 1.8 1.8 3 1.8s2.2-.6 3-1.8M7.6 8h.01M12.4 8h.01" /></Icon>;
export const ArrowLeftIcon = () => <Icon><path d="M16 10H4.5M9 5.5L4.5 10 9 14.5" /></Icon>;
export const VideoIcon = () => <Icon><rect x="3" y="5.5" width="10" height="9" rx="2" /><path d="M13 9l4-2.2v6.4L13 11z" /></Icon>;
export const InfoIcon = () => <Icon><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5M10 6.6h.01" /></Icon>;
export const WarnIcon = () => <Icon><path d="M10 3.5l7 12.5H3z" /><path d="M10 8.5v3.2M10 14h.01" /></Icon>;
export const TrophyIcon = () => <Icon><path d="M6.5 3.5h7v4a3.5 3.5 0 0 1-7 0zM6.5 5H3.5c0 2 1 3.3 3 3.5M13.5 5h3c0 2-1 3.3-3 3.5M10 11v3M7 16.5h6" /></Icon>;
export const ClockIcon = () => <Icon><circle cx="10" cy="10" r="7" /><path d="M10 6v4.2l2.6 1.6" /></Icon>;
export const FolderIcon = () => <Icon><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.6 2H15.5A1.5 1.5 0 0 1 17 8.5v6A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z" /></Icon>;
export const ShieldIcon = () => <Icon><path d="M10 3l6 2v4.5c0 3.4-2.4 6.2-6 7.5-3.6-1.3-6-4.1-6-7.5V5z" /><path d="M7.5 10l1.8 1.8L12.7 8" /></Icon>;

// Communications menu and tables (drawn to match SuperCreator's line icons)
export const ListIcon = () => <Icon><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.8 5.5h.01M3.8 10h.01M3.8 14.5h.01" /></Icon>;
export const WorkflowIcon = () => <Icon><rect x="3" y="3" width="5.5" height="5.5" rx="1.2" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" /><path d="M5.75 8.5V11a1.5 1.5 0 0 0 1.5 1.5h4.25" /></Icon>;
export const FileTextIcon = () => <Icon><path d="M5.5 2.5h5.5l4 4V16a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V4a1.5 1.5 0 0 1 1.5-1.5zM11 2.5V7h4M7 11h6M7 14h4" /></Icon>;
export const FolderOpenIcon = () => <Icon><path d="M3 15V5.5A1.5 1.5 0 0 1 4.5 4H8l1.5 2H14a1.5 1.5 0 0 1 1.5 1.5V9M3 15.5h11.6a1.5 1.5 0 0 0 1.4-1l1.3-4.2a1 1 0 0 0-1-1.3H6.2a1.5 1.5 0 0 0-1.4 1z" /></Icon>;
export const SendIcon = () => <Icon><path d="M17 3L8.6 11.4M17 3l-5.2 14-3.2-5.6L3 8.2z" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="9" cy="9" r="5" /><path d="M13 13l3.5 3.5" /></Icon>;
export const PlusIcon = () => <Icon><path d="M10 4.5v11M4.5 10h11" /></Icon>;
export const GridIcon = () => <Icon><rect x="3.5" y="3.5" width="5" height="5" rx="1" /><rect x="11.5" y="3.5" width="5" height="5" rx="1" /><rect x="3.5" y="11.5" width="5" height="5" rx="1" /><rect x="11.5" y="11.5" width="5" height="5" rx="1" /></Icon>;
export const DownloadIcon = () => <Icon><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 15.5h12" /></Icon>;
export const UploadCloudIcon = () => <Icon><path d="M6.5 14.5a3.5 3.5 0 0 1-.5-6.9 4.5 4.5 0 0 1 8.7.4A3 3 0 0 1 14 14.5M10 17v-6M7.8 13.2L10 11l2.2 2.2" /></Icon>;
export const CopyIcon = () => <Icon><rect x="7" y="7" width="9" height="9" rx="1.8" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></Icon>;
export const MoreIcon = () => <Icon><path d="M10 4.5h.01M10 10h.01M10 15.5h.01" /></Icon>;
export const MicIcon = () => <Icon><rect x="7.5" y="3" width="5" height="9" rx="2.5" /><path d="M4.8 10a5.2 5.2 0 0 0 10.4 0M10 15.2V17" /></Icon>;
export const FolderPlusIcon = () => <Icon><path d="M3 15V5.5A1.5 1.5 0 0 1 4.5 4H8l1.5 2h6A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5zM10 9v4M8 11h4" /></Icon>;

// Flow builder
export const TrashIcon = () => <Icon><path d="M4 6h12M8 6V4.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V6M5.5 6l.7 9.6c0 .5.4.9.9.9h5.8c.5 0 .9-.4.9-.9L14.5 6M8.5 9v4.5M11.5 9v4.5" /></Icon>;
export const FilterIcon = () => <Icon><path d="M3.5 4.5h13l-5 6v4.8l-3 1.7v-6.5z" /></Icon>;
export const MailIcon = () => <Icon><rect x="3" y="4.5" width="14" height="11" rx="2" /><path d="M3.5 6.5l6.5 4.8 6.5-4.8" /></Icon>;
export const TagIcon = () => <Icon><path d="M3.5 4.5v5.2c0 .4.2.8.5 1.1l5.7 5.7a1.5 1.5 0 0 0 2.1 0l4.4-4.4a1.5 1.5 0 0 0 0-2.1L10.5 4.3A1.5 1.5 0 0 0 9.4 3.8H4.2c-.4 0-.7.3-.7.7zM7 7.2h.01" /></Icon>;
export const MergeIcon = () => <Icon><circle cx="5" cy="4.5" r="1.6" /><circle cx="5" cy="15.5" r="1.6" /><circle cx="15" cy="10" r="1.6" /><path d="M5 6.1v1.4a3 3 0 0 0 3 3h5.4M5 13.9v-1.4a3 3 0 0 1 3-3" /></Icon>;
export const PencilIcon = () => <Icon><path d="M13.2 3.8l3 3L7 16H4v-3zM11.5 5.5l3 3" /></Icon>;
export const ChartIcon = () => <Icon><path d="M3.5 16.5h13M5.5 13V9.5M9 13V5M12.5 13v-6M16 13v-3" /></Icon>;
export const PlayCircleIcon = () => <Icon><circle cx="10" cy="10" r="7" /><path d="M8.5 7.2l4 2.8-4 2.8z" /></Icon>;
export const MinusIcon = () => <Icon><path d="M4.5 10h11" /></Icon>;
export const FitIcon = () => <Icon><path d="M4 7.5V5a1 1 0 0 1 1-1h2.5M12.5 4H15a1 1 0 0 1 1 1v2.5M16 12.5V15a1 1 0 0 1-1 1h-2.5M7.5 16H5a1 1 0 0 1-1-1v-2.5" /></Icon>;
export const GearIcon = () => <Icon><circle cx="10" cy="10" r="2.4" /><path d="M8.6 2.7h2.8l.4 1.9 1.3.7 1.8-.7 1.4 2.4-1.4 1.3v1.5l1.4 1.3-1.4 2.4-1.8-.7-1.3.7-.4 1.9H8.6l-.4-1.9-1.3-.7-1.8.7-1.4-2.4 1.4-1.3V8.3L3.7 7l1.4-2.4 1.8.7 1.3-.7z" /></Icon>;
export const SortIcon = () => <Icon><path d="M7 4v12M4.5 6.5L7 4l2.5 2.5M13 16V4M10.5 13.5L13 16l2.5-2.5" /></Icon>;
export const HourglassIcon = () => <Icon><path d="M6 3.5h8M6 16.5h8M6.8 3.5c0 3 1.5 4.2 3.2 6.5-1.7 2.3-3.2 3.5-3.2 6.5M13.2 3.5c0 3-1.5 4.2-3.2 6.5 1.7 2.3 3.2 3.5 3.2 6.5" /></Icon>;
