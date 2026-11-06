import {
  ArrowLeft, ArrowRight, AtSign, Bell, Bookmark, BriefcaseBusiness, Camera, Check,
  ChevronRight, Compass, Gift, Heart, Home, Link as LinkIcon, Mail, Megaphone,
  MessageCircle, Plus, RefreshCw, Search, Send, Settings, Share2, ShieldCheck,
  UserRound, UserRoundPlus, Users, Video, Wallet, X, Repeat2, CircleHelp,
} from 'lucide-react';

const ICONS = {
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
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
  briefcase: BriefcaseBusiness,
  bell: Bell,
  'user-plus': UserRoundPlus,
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
