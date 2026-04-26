import SwiftUI

struct MainTabView: View {
    @StateObject private var tabBarState = TabBarState()

    var body: some View {
        TabView(selection: $tabBarState.selectedTab) {
            SearchScreen()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .tag(0)

            MapView()
                .tabItem {
                    Label("Map", systemImage: "map")
                }
                .tag(1)

            FriendsView()
                .tabItem {
                    Label("Friends", systemImage: "person.2.fill")
                }
                .tag(2)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
                .tag(3)
        }
        .toolbar(tabBarState.isHidden ? .hidden : .visible, for: .tabBar)
        .tint(.red)
        .environmentObject(tabBarState)
    }
}
