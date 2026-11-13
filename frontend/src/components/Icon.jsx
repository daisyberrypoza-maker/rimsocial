import {
  ArrowLeft, ArrowRight, Eye, EyeOff, AtSign, Bell, Bookmark, Briefcase, Camera, Check, CalendarDays,
  ChevronRight, Compass, Gift, Heart, Home, Link as LinkIcon, Mail, Megaphone,
  MessageCircle, Plus, RefreshCw, Search, Send, Settings, Share2, ShieldCheck,
  UserRound, UserPlus, Users, Video, Wallet, X, Repeat2, CircleHelp, Play, ChevronDown, ArrowDownUp,
  BadgeCheck, CirclePlay, Clapperboard, Hash, Image as ImageIcon, MapPin, Pencil, Shield,
  Volume2, VolumeX, Pause, SkipBack, SkipForward, SlidersHorizontal, MoreHorizontal, MoreVertical, Trash2,
  File as FileIcon, LogOut, Ban, BellOff, Copy, Reply,
} from 'lucide-react';

const ICONS = {
  'refresh-cw': RefreshCw,
  'trash-2': Trash2, 'log-out': LogOut, 'shield-ban': Ban, images: ImageIcon, 'bell-off': BellOff, copy: Copy, reply: Reply,
  file: FileIcon,
  calendar: CalendarDays,
  mail: Mail,
  'badge-check': BadgeCheck, 'circle-play': CirclePlay, clapperboard: Clapperboard, hash: Hash, image: ImageIcon,
  'map-pin': MapPin, pencil: Pencil, 'repeat-2': Repeat2, shield: Shield, 'user-round': UserRound,
  'arrow-left': ArrowLeft,
  sliders: SlidersHorizontal, ellipsis: MoreHorizontal, 'more-vertical': MoreVertical, trash: Trash2, 'volume-2': Volume2, 'volume-x': VolumeX, pause: Pause, 'skip-back': SkipBack, 'skip-forward': SkipForward,
  'arrow-right': ArrowRight,
  eye: Eye,
  'eye-off': EyeOff,
  close: X,
  x: X,
  check: Check,
  bookmark: Bookmark,
  camera: Camera,
  settings: Settings,
  home: Home,
  search: Search,
  people: Users,
  users: Users,
  user: UserRound,
  plus: Plus,
  'message-circle': MessageCircle,
  repeat: Repeat2,
  heart: Heart,
  gift: Gift,
  share: Share2,
  'share-2': Share2,
  chevron: ChevronRight,
  'chevron-right': ChevronRight,
  video: Video,
  compass: Compass,
  wallet: Wallet,
  briefcase: Briefcase,
  bell: Bell,
  'user-plus': UserPlus,
  play: Play,
  sort: ArrowDownUp,
  'chevron-down': ChevronDown,
  refresh: RefreshCw,
  send: Send,
  'at-sign': AtSign,
  mail: Mail,
  link: LinkIcon,
  megaphone: Megaphone,
  'shield-check': ShieldCheck,
};

export default function Icon({ name, size = 26, strokeWidth = 2.2, className = '', ...props }) {
  const VectorIcon = ICONS[name] || CircleHelp;
  return (
    <VectorIcon
      size={size}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={`icon-vector ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
