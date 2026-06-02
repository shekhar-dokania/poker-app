import SwiftUI

struct SplashOverlayView: View {
    var body: some View {
        Image("SplashScreen")
            .resizable()
            .scaledToFill()
            .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
            .clipped()
            .ignoresSafeArea(.all)
    }
}
