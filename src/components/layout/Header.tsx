import { Link } from 'react-router-dom';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="text-xl font-bold text-[#F6821F] hover:text-[#d96d1a] transition-colors">
            Portfolio
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-8">
            <Link
              to="/projects"
              className="text-sm font-semibold text-gray-700 hover:text-[#F6821F] transition-colors"
            >
              Projects
            </Link>
            <Link
              to="/experience"
              className="text-sm font-semibold text-gray-700 hover:text-[#F6821F] transition-colors"
            >
              Experience
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
