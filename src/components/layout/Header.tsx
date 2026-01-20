import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/features/auth/AuthProvider';

interface HeaderProps {
  onNewPage?: () => void;
  onLogin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewPage, onLogin }) => {
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
            Portfolio
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/projects"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Projects
            </Link>
            <Link
              to="/experience"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Experience
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <SearchBar />

            {/* New Page Button (Admin only) */}
            {isAuthenticated && onNewPage && (
              <button
                onClick={onNewPage}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                New Page
              </button>
            )}

            {/* Login Button (Guest only) */}
            {!isAuthenticated && onLogin && (
              <button
                onClick={onLogin}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Login
              </button>
            )}

            {/* User Menu */}
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
};
