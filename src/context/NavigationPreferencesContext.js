import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "expressmart.bottom-nav.mode";
const HOME_ORDER_STORAGE_KEY = "expressmart.home-order";
const HOME_STYLE_STORAGE_KEY = "expressmart.home-style";
const NavigationPreferencesContext = createContext(null);

export const NavigationPreferencesProvider = ({ children }) => {
  const [bottomNavMode, setBottomNavModeState] = useState("docked");
  const [homeFirst, setHomeFirstState] = useState("classic");
  const [homeStyle, setHomeStyleState] = useState("feed");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "floating" || value === "docked") {
          setBottomNavModeState(value);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HOME_ORDER_STORAGE_KEY)
      .then((value) => {
        if (value === "classic" || value === "feed") setHomeFirstState(value);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HOME_STYLE_STORAGE_KEY)
      .then((value) => {
        if (value === "classic" || value === "feed") setHomeStyleState(value);
      })
      .catch(() => {});
  }, []);

  const setBottomNavMode = (mode) => {
    if (mode !== "floating" && mode !== "docked") return;
    setBottomNavModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  };

  const setHomeFirst = (value) => {
    if (value !== "classic" && value !== "feed") return;
    setHomeFirstState(value);
    AsyncStorage.setItem(HOME_ORDER_STORAGE_KEY, value).catch(() => {});
  };

  const setHomeStyle = (value) => {
    if (value !== "classic" && value !== "feed") return;
    setHomeStyleState(value);
    AsyncStorage.setItem(HOME_STYLE_STORAGE_KEY, value).catch(() => {});
  };

  return (
    <NavigationPreferencesContext.Provider
      value={{
        bottomNavMode,
        setBottomNavMode,
        homeFirst,
        setHomeFirst,
        homeStyle,
        setHomeStyle,
      }}
    >
      {children}
    </NavigationPreferencesContext.Provider>
  );
};

export const useNavigationPreferences = () => {
  const context = useContext(NavigationPreferencesContext);
  if (!context) {
    throw new Error(
      "useNavigationPreferences must be used inside NavigationPreferencesProvider",
    );
  }
  return context;
};
