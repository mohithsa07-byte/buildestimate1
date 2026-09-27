import React from 'react';

export default function Header({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'estimator', label: 'Estimator' },
    { id: 'rates', label: 'Material Rates' },
    { id: 'concrete', label: 'Concrete Mix' },
    { id: 'saved', label: 'Saved Projects' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div 
          className="flex items-center space-x-3 cursor-pointer" 
          onClick={() => setActiveTab && setActiveTab('estimator')}
        >
          <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-sm">
            B
          </div>
          <span className="font-extrabold text-slate-800 text-lg tracking-tight">BuildEstimate</span>
        </div>

        <nav className="flex items-center space-x-1 sm:space-x-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab && setActiveTab(item.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}