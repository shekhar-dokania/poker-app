package com.example.pokerapp

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.pokerapp.ui.LobbyScreen
import com.example.pokerapp.ui.TableScreen

@Composable
fun MainNavigation() {
  val backStack = rememberNavBackStack(LobbyKey)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<LobbyKey> {
          LobbyScreen(onNavigateToTable = { backStack.add(TableKey) })
        }
        entry<TableKey> {
          TableScreen(onNavigateBack = { backStack.removeLastOrNull() })
        }
      },
  )
}
