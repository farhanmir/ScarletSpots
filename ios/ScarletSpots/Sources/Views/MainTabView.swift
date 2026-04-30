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

            DiscoverView()
                .tabItem {
                    Label("Discover", systemImage: "fork.knife")
                }
                .tag(3)

            ProfileView()
                .tabItem {
                    Label {
                        Text("Profile")
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                    } icon: {
                        Image(systemName: "person.fill")
                    }
                }
                .tag(4)
        }
        .toolbar(tabBarState.isHidden ? .hidden : .visible, for: .tabBar)
        .tint(.red)
        .environmentObject(tabBarState)
    }
}
