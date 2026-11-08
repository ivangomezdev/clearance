import {stockResponse} from '../../../lib/store-stock-service';
export async function GET(request: Request) {return stockResponse(request);}
