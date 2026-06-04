package com.example.pokerapp.data

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.io.InputStreamReader
import java.io.BufferedReader

class StoreManager(private val context: Context) : PurchasesUpdatedListener, BillingClientStateListener {

    private val billingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases()
        .build()

    private val scope = CoroutineScope(Dispatchers.IO)

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    init {
        billingClient.startConnection(this)
    }

    override fun onBillingSetupFinished(billingResult: BillingResult) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            queryProducts()
        }
    }

    override fun onBillingServiceDisconnected() {
        // Try to restart the connection on the next request to
        // Google Play by calling the startConnection() method.
    }

    private fun queryProducts() {
        val queryProductDetailsParams =
            QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId("com.mayhempoker.coins.100")
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build(),
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId("com.mayhempoker.coins.500")
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build(),
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId("com.mayhempoker.coins.1000")
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build()
                    )
                )
                .build()

        billingClient.queryProductDetailsAsync(queryProductDetailsParams) { billingResult, productDetailsList ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                scope.launch {
                    _products.value = productDetailsList
                }
            }
        }
    }

    fun purchaseProduct(activity: Activity, productDetails: ProductDetails) {
        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .build()
        )

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()

        billingClient.launchBillingFlow(activity, billingFlowParams)
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        } else if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            // Handle an error caused by a user cancelling the purchase flow.
        } else {
            // Handle any other error codes.
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged) {
                // Verify on backend
                scope.launch {
                    val isVerified = verifyPurchaseOnBackend(purchase)
                    if (isVerified) {
                        val acknowledgePurchaseParams = AcknowledgePurchaseParams.newBuilder()
                            .setPurchaseToken(purchase.purchaseToken)
                            .build()
                        billingClient.acknowledgePurchase(acknowledgePurchaseParams) { billingResult ->
                            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                                // Purchase acknowledged!
                            }
                        }
                    }
                }
            }
        }
    }

    private fun verifyPurchaseOnBackend(purchase: Purchase): Boolean {
        try {
            val url = URL("\${PokerSocketManager.serverURL}/api/verify-play-receipt")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            
            // NOTE: In a real application, you would attach the user's auth token here.
            // For now, we will just send the receipt data.
            connection.doOutput = true

            val jsonParam = JSONObject()
            jsonParam.put("purchaseToken", purchase.purchaseToken)
            jsonParam.put("productId", purchase.products.firstOrNull())
            
            val writer = OutputStreamWriter(connection.outputStream)
            writer.write(jsonParam.toString())
            writer.flush()
            writer.close()

            if (connection.responseCode == 200) {
                return true
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }
}
