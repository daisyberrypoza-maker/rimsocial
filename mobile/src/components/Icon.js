import React from 'react';
import {
  ArrowLeft, ArrowRight, Eye, EyeOff, AtSign, Bell, Bookmark, Camera, Check, ChevronRight, Compass, Gift,
  Heart, Home, Link as LinkIcon, Mail, MessageCircle, Plus, RefreshCw, Search, Send, Settings, Share2,
  UserRound, UserPlus, Users, Video, Wallet, X, Repeat2, CircleHelp, Play, ChevronDown, ArrowDownUp,
  Pause, Volume2, VolumeX, MoreVertical, Pencil, Trash2, Image as ImageIcon, MapPin, GalleryHorizontal,
} from 'lucide-react-native';

// Same names as the web Icon.jsx, so screens read the same in both apps
const ICONS = {
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, eye: Eye, 'eye-off': EyeOff, at: AtSign, 'at-sign': AtSign,
  bell: Bell, bookmark: Bookmark, camera: Camera, check: Check, 'chevron-right': ChevronRight, chevron: ChevronRight,
  compass: Compass, gift: Gift, heart: Heart, home: Home, link: LinkIcon, mail: Mail, 'message-circle': MessageCircle,
  plus: Plus, refresh: RefreshCw, search: Search, send: Send, share: Share2, 'share-2': Share2, settings: Settings,
  user: UserRound, 'user-round': UserRound, 'user-plus': UserPlus, people: Users, users: Users, video: Video,
  wallet: Wallet, x: X, close: X, repeat: Repeat2, 'repeat-2': Repeat2, play: Play, 'chevron-down': ChevronDown,
  sort: ArrowDownUp, pause: Pause, 'volume-2': Volume2, 'volume-x': VolumeX, 'more-vertical': MoreVertical,
  pencil: Pencil, trash: Trash2, image: ImageIcon, 'map-pin': MapPin,
  // Tab icons: Stories is a pair of cards, Rimlight a filled play shape (drawn like the web BottomNav)
  stories: GalleryHorizontal, rimlight: Play,
};

// filled: solid shape (active tab, right-side controls on Rimlight); otherwise outline
export default function Icon({ name, size = 26, color = '#111', strokeWidth = 2.2, filled = false }) {
  const Cmp = ICONS[name] || CircleHelp;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} />;
}
