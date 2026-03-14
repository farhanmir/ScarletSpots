import React, { createContext, useContext, useState } from 'react';

interface TabBarContextType {
  isTabBarHidden: boolean;
  setIsTabBarHidden: (hidden: boolean) => void;
}

const TabBarContext = createContext<TabBarContextType>({
  isTabBarHidden: false,
  setIsTabBarHidden: () => {},
});

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);
  return (
    <TabBarContext.Provider value={{ isTabBarHidden, setIsTabBarHidden }}>
      {children}
    </TabBarContext.Provider>
  );
}

export const useTabBar = () => useContext(TabBarContext);
